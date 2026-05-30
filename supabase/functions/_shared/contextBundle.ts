// ════════════════════════════════════════════════════════════════════════
//  Context Bundle (ТЗ §2.1) — единый снимок контекста дела для всех 5 агентов.
//
//  Назначение: собрать в ОДНУ нормализованную структуру всё, что нужно
//  агентам A1–A5 (анализатор / куратор / планировщик / суфлёр / шаблонизатор),
//  чтобы не дублировать выборки в каждой функции и подавать LLM компактный,
//  предсказуемый контекст под жёсткий TPM-лимит Groq.
//
//  Два входа (две роли):
//    • assembleClientContext(sb, userId)        — кабинет клиента (A2/RAG).
//    • assembleLawyerClientContext(sb, lcId, …)  — CRM юриста (A1/A4/A5).
//
//  Источники (реальная схема проекта, НЕ идеализированная в ТЗ):
//    profiles, medical_documents_v2 (+document_article_links→disease_articles_565),
//    lawyer_clients, lawyer_client_med_docs, case_events, case_notes,
//    chat_conversations/chat_messages, lawyer_chat_messages, client_document_access.
//
//  ⚠️ Доступ юриста к медданным клиента-аккаунта — ТОЛЬКО при активной записи
//     client_document_access (как в lawyer-analyze-client). Без неё берём
//     документы, загруженные самим юристом (lawyer_client_med_docs).
//
//  Чего здесь НЕТ (отложено): examination_plan / action_plan (P3 — таблиц пока
//  нет), структурированный опросник (хранится неявно). Появятся — добавим сюда.
// ════════════════════════════════════════════════════════════════════════

// Клиент намеренно типизирован как any: в edge-функциях createClient вызывается
// без генерик-параметров (Database), поэтому строгие типы строк недоступны.
// deno-lint-ignore no-explicit-any
type Sb = any;

// Сколько сырого OCR-текста тащим из БД на документ (защита от мегабайтных карт).
const RAW_TEXT_CAP = 4000;

export interface ContextArticle {
  articleNumber: string;
  title: string;
  category: string | null;
}

export interface ContextDocument {
  id: string;
  title: string | null;
  date: string | null;
  category: string | null; // ai_fitness_category
  categoryChance: number | null; // ai_category_chance
  explanation: string | null; // ai_explanation
  recommendations: string[];
  rawText: string | null; // сырой текст (обрезан до RAW_TEXT_CAP)
  source: "client_account" | "lawyer_uploads";
  articles: ContextArticle[]; // связанные статьи РБ (через document_article_links)
}

export interface ContextChatMessage {
  role: "client" | "lawyer" | "assistant" | "system" | string;
  content: string;
  at: string | null;
}

export interface ContextCaseEvent {
  type: string;
  date: string;
  title: string;
  description: string | null;
  outcome: string | null;
}

export interface ContextClient {
  name: string | null;
  birthYear: number | null;
  birthDate: string | null;
  city: string | null;
  region: string | null;
  registrationAddress: string | null;
  actualAddress: string | null;
  phone: string | null;
  // Реквизиты для шаблонизатора A5 (жалобы/заявления):
  militaryCommissariat: string | null;
  militaryCommissariatAddress: string | null;
  superiorMilitaryCommissariat: string | null;
  superiorMilitaryCommissariatAddress: string | null;
  courtByMilitary: string | null;
  courtByRegistration: string | null;
  prosecutorOffice: string | null;
}

export interface ContextCrm {
  stage: string | null;
  diagnosis: string | null;
  expectedCategory: string | null;
  conscriptionDate: string | null;
  priority: string | null;
  notes: string | null;
  caseWon: boolean | null;
}

export interface ContextExamItem {
  itemType: string; // analysis|examination|specialist
  name: string;
  reason: string | null;
  status: string;
  source: string; // ai|lawyer
}

export interface ContextActionItem {
  title: string;
  description: string | null;
  status: string;
  priority: string;
  source: string;
}

export interface ContextPlans {
  examination: ContextExamItem[];
  action: ContextActionItem[];
}

export interface ContextBundle {
  scope: "client" | "lawyer";
  client: ContextClient;
  crm: ContextCrm | null; // только для scope=lawyer (или связанного клиента)
  documents: ContextDocument[];
  chatHistory: ContextChatMessage[];
  caseEvents: ContextCaseEvent[];
  plans: ContextPlans | null; // план дообследования/действий (scope=lawyer)
  meta: {
    assembledAtIso: string;
    documentCount: number;
    docSource: "client_account" | "lawyer_uploads" | "none";
    accessNote: string | null; // напр. «клиент не дал доступ к документам»
  };
}

// ── helpers ─────────────────────────────────────────────────────────────

function emptyClient(): ContextClient {
  return {
    name: null,
    birthYear: null,
    birthDate: null,
    city: null,
    region: null,
    registrationAddress: null,
    actualAddress: null,
    phone: null,
    militaryCommissariat: null,
    militaryCommissariatAddress: null,
    superiorMilitaryCommissariat: null,
    superiorMilitaryCommissariatAddress: null,
    courtByMilitary: null,
    courtByRegistration: null,
    prosecutorOffice: null,
  };
}

function nowIso(): string {
  // edge-runtime: new Date() допустим (это не workflow-скрипт).
  return new Date().toISOString();
}

function capText(s: string | null | undefined, cap: number): string | null {
  if (!s) return null;
  const t = String(s);
  return t.length > cap ? t.slice(0, cap) : t;
}

function normRecs(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean);
  if (typeof v === "string") return [v];
  return [];
}

// Тянет связанные статьи РБ для набора документов одним запросом.
// Возвращает Map<document_id, ContextArticle[]>.
async function fetchArticlesForDocs(
  sb: Sb,
  docIds: string[],
): Promise<Map<string, ContextArticle[]>> {
  const byDoc = new Map<string, ContextArticle[]>();
  if (!docIds.length) return byDoc;

  const { data: links } = await sb
    .from("document_article_links")
    .select("document_id, article_id")
    .in("document_id", docIds);

  if (!links?.length) return byDoc;

  const articleIds = [...new Set(links.map((l: { article_id: string }) => l.article_id))];
  const { data: articles } = await sb
    .from("disease_articles_565")
    .select("id, article_number, title, category")
    .in("id", articleIds);

  const artById = new Map<string, ContextArticle>();
  for (const a of articles || []) {
    artById.set(a.id, {
      articleNumber: a.article_number,
      title: a.title,
      category: a.category ?? null,
    });
  }

  for (const l of links) {
    const art = artById.get(l.article_id);
    if (!art) continue;
    const arr = byDoc.get(l.document_id) || [];
    arr.push(art);
    byDoc.set(l.document_id, arr);
  }
  return byDoc;
}

// ── вход №1: контекст клиента (его собственный кабинет) ───────────────────
/**
 * Собирает Context Bundle для клиента по его user_id (A2-куратор, RAG-виджет).
 * sb — service-role или RLS-клиент с правами на чтение данных этого пользователя.
 */
export async function assembleClientContext(
  sb: Sb,
  userId: string,
  opts: { maxChatMessages?: number; maxDocs?: number } = {},
): Promise<ContextBundle> {
  const maxChat = opts.maxChatMessages ?? 12;
  const maxDocs = opts.maxDocs ?? 20;

  const [{ data: profile }, { data: docsRaw }, { data: events }] = await Promise.all([
    sb.from("profiles").select("*").eq("id", userId).maybeSingle(),
    sb
      .from("medical_documents_v2")
      .select(
        "id, title, document_date, ai_fitness_category, ai_category_chance, ai_explanation, ai_recommendations, raw_text",
      )
      .eq("user_id", userId)
      .order("document_date", { ascending: false })
      .limit(maxDocs),
    sb
      .from("case_events")
      .select("event_type, event_date, title, description, outcome")
      .eq("user_id", userId)
      .order("event_date", { ascending: false })
      .limit(20),
  ]);

  const docIds = (docsRaw || []).map((d: { id: string }) => d.id);
  const articlesByDoc = await fetchArticlesForDocs(sb, docIds);

  const documents: ContextDocument[] = (docsRaw || []).map((d: Record<string, unknown>) => ({
    id: d.id as string,
    title: (d.title as string) ?? null,
    date: (d.document_date as string) ?? null,
    category: (d.ai_fitness_category as string) ?? null,
    categoryChance: (d.ai_category_chance as number) ?? null,
    explanation: (d.ai_explanation as string) ?? null,
    recommendations: normRecs(d.ai_recommendations),
    rawText: capText(d.raw_text as string, RAW_TEXT_CAP),
    source: "client_account",
    articles: articlesByDoc.get(d.id as string) || [],
  }));

  // История чата: последняя по обновлению беседа, хвост сообщений.
  let chatHistory: ContextChatMessage[] = [];
  const { data: conv } = await sb
    .from("chat_conversations")
    .select("id")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (conv?.id) {
    const { data: msgs } = await sb
      .from("chat_messages")
      .select("role, content, created_at")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: false })
      .limit(maxChat);
    chatHistory = (msgs || [])
      .reverse()
      .map((m: { role: string; content: string; created_at: string | null }) => ({
        role: m.role,
        content: m.content,
        at: m.created_at ?? null,
      }));
  }

  const client = emptyClient();
  if (profile) {
    client.name = profile.full_name ?? null;
    client.birthDate = profile.birth_date ?? null;
    client.birthYear = profile.birth_date ? Number(String(profile.birth_date).slice(0, 4)) || null : null;
    client.city = profile.city ?? null;
    client.region = profile.region ?? null;
    client.registrationAddress = profile.registration_address ?? null;
    client.actualAddress = profile.actual_address ?? null;
    client.phone = profile.phone ?? null;
    client.militaryCommissariat = profile.military_commissariat ?? null;
    client.militaryCommissariatAddress = profile.military_commissariat_address ?? null;
    client.superiorMilitaryCommissariat = profile.superior_military_commissariat ?? null;
    client.superiorMilitaryCommissariatAddress = profile.superior_military_commissariat_address ?? null;
    client.courtByMilitary = profile.court_by_military ?? null;
    client.courtByRegistration = profile.court_by_registration ?? null;
    client.prosecutorOffice = profile.prosecutor_office ?? null;
  }

  return {
    scope: "client",
    client,
    crm: null,
    documents,
    chatHistory,
    caseEvents: (events || []).map((e: Record<string, unknown>) => ({
      type: e.event_type as string,
      date: e.event_date as string,
      title: e.title as string,
      description: (e.description as string) ?? null,
      outcome: (e.outcome as string) ?? null,
    })),
    plans: null, // планы привязаны к карточке CRM, не к user_id
    meta: {
      assembledAtIso: nowIso(),
      documentCount: documents.length,
      docSource: documents.length ? "client_account" : "none",
      accessNote: null,
    },
  };
}

// ── вход №2: контекст клиента глазами юриста (CRM) ────────────────────────
/**
 * Собирает Context Bundle по карточке lawyer_clients (A1-анализатор, A4-суфлёр,
 * A5-шаблонизатор). Проверяет, что карточка принадлежит юристу. Документы —
 * из аккаунта клиента (если есть активный client_document_access) ИЛИ из
 * загруженных юристом сканов (lawyer_client_med_docs).
 *
 * sb ДОЛЖЕН быть service-role (обходит RLS) — вызывающая функция обязана
 * предварительно проверить, что lawyer_id == залогиненный юрист.
 */
export async function assembleLawyerClientContext(
  sb: Sb,
  lawyerClientId: string,
  lawyerId: string,
  opts: { maxChatMessages?: number; maxDocs?: number } = {},
): Promise<ContextBundle> {
  const maxChat = opts.maxChatMessages ?? 14;
  const maxDocs = opts.maxDocs ?? 20;

  const { data: lc, error: lcErr } = await sb
    .from("lawyer_clients")
    .select("*")
    .eq("id", lawyerClientId)
    .eq("lawyer_id", lawyerId)
    .maybeSingle();

  if (lcErr || !lc) {
    throw new Error("Карточка клиента не найдена или нет доступа");
  }

  // Документы: приоритет — аккаунт клиента при активном доступе, иначе сканы юриста.
  let documents: ContextDocument[] = [];
  let docSource: "client_account" | "lawyer_uploads" | "none" = "none";
  let accessNote: string | null = null;

  if (lc.client_user_id) {
    const { data: access } = await sb
      .from("client_document_access")
      .select("id")
      .eq("client_user_id", lc.client_user_id)
      .eq("lawyer_id", lawyerId)
      .eq("is_active", true)
      .maybeSingle();

    if (access) {
      const { data: docsRaw } = await sb
        .from("medical_documents_v2")
        .select(
          "id, title, document_date, ai_fitness_category, ai_category_chance, ai_explanation, ai_recommendations, raw_text",
        )
        .eq("user_id", lc.client_user_id)
        .order("document_date", { ascending: false })
        .limit(maxDocs);

      const docIds = (docsRaw || []).map((d: { id: string }) => d.id);
      const articlesByDoc = await fetchArticlesForDocs(sb, docIds);
      documents = (docsRaw || []).map((d: Record<string, unknown>) => ({
        id: d.id as string,
        title: (d.title as string) ?? null,
        date: (d.document_date as string) ?? null,
        category: (d.ai_fitness_category as string) ?? null,
        categoryChance: (d.ai_category_chance as number) ?? null,
        explanation: (d.ai_explanation as string) ?? null,
        recommendations: normRecs(d.ai_recommendations),
        rawText: capText(d.raw_text as string, RAW_TEXT_CAP),
        source: "client_account",
        articles: articlesByDoc.get(d.id as string) || [],
      }));
      if (documents.length) docSource = "client_account";
    } else {
      accessNote = "Клиент привязан, но не дал доступ к своим документам.";
    }
  }

  // Fallback / основной поток для CRM-only клиентов — сканы, загруженные юристом.
  if (!documents.length) {
    const { data: docsRaw } = await sb
      .from("lawyer_client_med_docs")
      .select(
        "id, title, document_date, ai_fitness_category, ai_category_chance, ai_explanation, ai_recommendations, raw_text",
      )
      .eq("lawyer_client_id", lawyerClientId)
      .order("document_date", { ascending: false })
      .limit(maxDocs);

    documents = (docsRaw || []).map((d: Record<string, unknown>) => ({
      id: d.id as string,
      title: (d.title as string) ?? null,
      date: (d.document_date as string) ?? null,
      category: (d.ai_fitness_category as string) ?? null,
      categoryChance: (d.ai_category_chance as number) ?? null,
      explanation: (d.ai_explanation as string) ?? null,
      recommendations: normRecs(d.ai_recommendations),
      rawText: capText(d.raw_text as string, RAW_TEXT_CAP),
      source: "lawyer_uploads",
      articles: [], // lawyer_client_med_docs не линкуются к РБ в текущей схеме
    }));
    if (documents.length) docSource = "lawyer_uploads";
    if (!documents.length && !accessNote) {
      accessNote = "Документы не загружены: добавьте сканы во вкладке «Документы».";
    }
  }

  // Заметки + переписка + сохранённые планы (P3) → одним пакетом.
  const [{ data: notes }, { data: chatMsgs }, { data: examItems }, { data: actItems }] = await Promise.all([
    sb
      .from("case_notes")
      .select("content, note_type, created_at, author_id")
      .eq("lawyer_client_id", lawyerClientId)
      .order("created_at", { ascending: false })
      .limit(10),
    sb
      .from("lawyer_chat_messages")
      .select("content, message_type, sender_id, created_at")
      .eq("lawyer_client_id", lawyerClientId)
      .order("created_at", { ascending: false })
      .limit(maxChat),
    sb
      .from("examination_plan_items")
      .select("item_type, name, reason, status, source")
      .eq("lawyer_client_id", lawyerClientId)
      .order("created_at", { ascending: true })
      .limit(40),
    sb
      .from("action_plan_items")
      .select("title, description, status, priority, source")
      .eq("lawyer_client_id", lawyerClientId)
      .order("order_index", { ascending: true })
      .limit(40),
  ]);

  const plans: ContextPlans = {
    examination: (examItems || []).map((e: Record<string, unknown>) => ({
      itemType: e.item_type as string,
      name: e.name as string,
      reason: (e.reason as string) ?? null,
      status: e.status as string,
      source: e.source as string,
    })),
    action: (actItems || []).map((a: Record<string, unknown>) => ({
      title: a.title as string,
      description: (a.description as string) ?? null,
      status: a.status as string,
      priority: a.priority as string,
      source: a.source as string,
    })),
  };

  const chatHistory: ContextChatMessage[] = (chatMsgs || [])
    .reverse()
    .filter((m: { content: string | null }) => m.content)
    .map((m: { content: string; message_type: string; sender_id: string; created_at: string }) => ({
      role: m.message_type === "system"
        ? "system"
        : m.sender_id === lawyerId
        ? "lawyer"
        : "client",
      content: m.content,
      at: m.created_at ?? null,
    }));

  const client = emptyClient();
  client.name = lc.client_name ?? null;
  client.birthYear = lc.client_birth_year ?? null;
  client.phone = lc.client_phone ?? null;

  // Если клиент привязан — обогащаем реквизитами из его профиля (для A5).
  if (lc.client_user_id) {
    const { data: profile } = await sb
      .from("profiles")
      .select(
        "birth_date, city, region, registration_address, actual_address, military_commissariat, military_commissariat_address, superior_military_commissariat, superior_military_commissariat_address, court_by_military, court_by_registration, prosecutor_office",
      )
      .eq("id", lc.client_user_id)
      .maybeSingle();
    if (profile) {
      client.birthDate = profile.birth_date ?? null;
      client.city = profile.city ?? null;
      client.region = profile.region ?? null;
      client.registrationAddress = profile.registration_address ?? null;
      client.actualAddress = profile.actual_address ?? null;
      client.militaryCommissariat = profile.military_commissariat ?? null;
      client.militaryCommissariatAddress = profile.military_commissariat_address ?? null;
      client.superiorMilitaryCommissariat = profile.superior_military_commissariat ?? null;
      client.superiorMilitaryCommissariatAddress = profile.superior_military_commissariat_address ?? null;
      client.courtByMilitary = profile.court_by_military ?? null;
      client.courtByRegistration = profile.court_by_registration ?? null;
      client.prosecutorOffice = profile.prosecutor_office ?? null;
    }
  }

  // Заметки юриста кладём в начало истории как контекст (role=system).
  const noteMsgs: ContextChatMessage[] = (notes || [])
    .reverse()
    .map((n: { content: string; note_type: string; created_at: string }) => ({
      role: "system",
      content: `[заметка юриста${n.note_type ? `: ${n.note_type}` : ""}] ${n.content}`,
      at: n.created_at ?? null,
    }));

  return {
    scope: "lawyer",
    client,
    crm: {
      stage: lc.crm_stage ?? null,
      diagnosis: lc.diagnosis ?? null,
      expectedCategory: lc.expected_category ?? null,
      conscriptionDate: lc.conscription_date ?? null,
      priority: lc.priority ?? null,
      notes: lc.notes ?? null,
      caseWon: lc.case_won ?? null,
    },
    documents,
    chatHistory: [...noteMsgs, ...chatHistory],
    caseEvents: [],
    plans,
    meta: {
      assembledAtIso: nowIso(),
      documentCount: documents.length,
      docSource,
      accessNote,
    },
  };
}

// ── сериализация под промпт (бюджет символов под TPM Groq) ────────────────

export interface SerializeOpts {
  include?: Array<"client" | "crm" | "plans" | "documents" | "chat" | "events">;
  maxChars?: number; // общий бюджет блока контекста
  docTextChars?: number; // сколько сырого текста на документ
  maxChatMessages?: number;
}

/**
 * Рендерит Context Bundle в компактный текстовый блок для system/user-промпта.
 * Бюджет символов жёсткий: Groq free-tier ~6K TPM, поэтому по умолчанию режем
 * контекст до ~6000 символов, отдавая приоритет фактам дела и свежим документам.
 */
export function serializeBundle(b: ContextBundle, opts: SerializeOpts = {}): string {
  const include = opts.include ?? ["client", "crm", "plans", "documents", "chat", "events"];
  const maxChars = opts.maxChars ?? 6000;
  const docTextChars = opts.docTextChars ?? 600;
  const maxChat = opts.maxChatMessages ?? 8;

  const parts: string[] = [];

  if (include.includes("client")) {
    const c = b.client;
    const lines = ["=== КЛИЕНТ ==="];
    if (c.name) lines.push(`ФИО: ${c.name}`);
    if (c.birthYear) lines.push(`Год рождения: ${c.birthYear}`);
    if (c.city || c.region) lines.push(`Город/регион: ${[c.city, c.region].filter(Boolean).join(", ")}`);
    if (c.registrationAddress) lines.push(`Адрес регистрации: ${c.registrationAddress}`);
    if (c.militaryCommissariat) lines.push(`Военкомат: ${c.militaryCommissariat}`);
    if (c.superiorMilitaryCommissariat) lines.push(`Вышестоящий ВК: ${c.superiorMilitaryCommissariat}`);
    if (lines.length > 1) parts.push(lines.join("\n"));
  }

  if (include.includes("crm") && b.crm) {
    const m = b.crm;
    const lines = ["=== ДЕЛО (CRM) ==="];
    if (m.stage) lines.push(`Стадия: ${m.stage}`);
    if (m.diagnosis) lines.push(`Диагноз (со слов юриста): ${m.diagnosis}`);
    if (m.expectedCategory) lines.push(`Ожидаемая категория: ${m.expectedCategory}`);
    if (m.conscriptionDate) lines.push(`Дата призыва: ${m.conscriptionDate}`);
    if (m.notes) lines.push(`Заметки: ${capText(m.notes, 400)}`);
    if (lines.length > 1) parts.push(lines.join("\n"));
  }

  if (include.includes("plans") && b.plans && (b.plans.examination.length || b.plans.action.length)) {
    const lines = ["=== ТЕКУЩИЙ ПЛАН ==="];
    if (b.plans.examination.length) {
      lines.push("Дообследование:");
      for (const e of b.plans.examination.slice(0, 15)) {
        lines.push(`  • [${e.status}] ${e.name}${e.reason ? ` — ${capText(e.reason, 160)}` : ""}`);
      }
    }
    if (b.plans.action.length) {
      lines.push("Действия:");
      for (const a of b.plans.action.slice(0, 15)) {
        lines.push(`  • [${a.status}/${a.priority}] ${a.title}`);
      }
    }
    parts.push(lines.join("\n"));
  }

  if (include.includes("documents") && b.documents.length) {
    const docLines: string[] = [`=== МЕДДОКУМЕНТЫ (${b.documents.length}) ===`];
    b.documents.forEach((d, i) => {
      const seg = [`Документ ${i + 1}: ${d.title || "без названия"} (${d.date || "дата неизвестна"})`];
      if (d.category) seg.push(`  Категория по ИИ: ${d.category}${d.categoryChance != null ? ` (~${d.categoryChance}%)` : ""}`);
      if (d.articles.length) {
        seg.push(`  Статьи РБ: ${d.articles.map((a) => `ст.${a.articleNumber}${a.category ? ` (${a.category})` : ""}`).join(", ")}`);
      }
      if (d.explanation) seg.push(`  Пояснение: ${capText(d.explanation, 300)}`);
      if (d.rawText) seg.push(`  Текст: ${capText(d.rawText, docTextChars)}`);
      docLines.push(seg.join("\n"));
    });
    parts.push(docLines.join("\n\n"));
  }

  if (include.includes("chat") && b.chatHistory.length) {
    const tail = b.chatHistory.slice(-maxChat);
    const lines = ["=== ИСТОРИЯ ОБЩЕНИЯ (хвост) ==="];
    for (const m of tail) {
      lines.push(`[${m.role}] ${capText(m.content, 400)}`);
    }
    parts.push(lines.join("\n"));
  }

  if (include.includes("events") && b.caseEvents.length) {
    const lines = ["=== СОБЫТИЯ ДЕЛА ==="];
    for (const e of b.caseEvents.slice(0, 8)) {
      lines.push(`${e.date} — ${e.title}${e.outcome ? ` → ${e.outcome}` : ""}`);
    }
    parts.push(lines.join("\n"));
  }

  if (b.meta.accessNote) parts.push(`⚠️ ${b.meta.accessNote}`);

  let out = parts.join("\n\n");
  if (out.length > maxChars) {
    // Жёсткий потолок: режем хвост (история/события менее критичны, чем факты).
    out = out.slice(0, maxChars) + "\n…(контекст усечён по лимиту)";
  }
  return out;
}
