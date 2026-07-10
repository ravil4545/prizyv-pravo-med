import { supabase } from "@/integrations/supabase/client";
import { differenceInMonths, format } from "date-fns";

// Контекст ограничен ~40k (раньше 100k): дешевле/быстрее на OpenAI, при этом
// сохраняется почти весь набор данных пользователя. Базу знаний (RAG) chat
// edge-функция теперь подмешивает ВСЕГДА (старый Groq-порог 12k снят), так что
// cap — чисто оптимизация стоимости/скорости и на доступность RAG не влияет.
// Документы идут от новых к старым → хвостовая обрезка режет старые в первую очередь.
const MAX_CONTEXT_CHARS = 40000;

/**
 * Собирает полный контекст для ИИ-чата:
 *  - Профиль (ФИО, дата рождения, военкомат)
 *  - Медицинские документы + AI-анализ + ссылки на статьи РБ-565
 *  - События дела (case_events) — последние 10
 *  - Опросник (если заполнен — отдельной секцией)
 *
 * Контекст обрезается до 50k символов чтобы влезть в edge-функцию chat.
 */
export async function buildAIContext(): Promise<string> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session || session.user.is_anonymous) return "";
    const userId = session.user.id;
    const now = new Date();

    // Делаем каждый запрос изолированно (allSettled), чтобы ошибка в одной
    // таблице не валила весь контекст. profile / case_events могут отсутствовать
    // в некоторых средах — это не должно блокировать чат с ИИ.
    const [profileSet, docsSet, linksSet, eventsSet] = await Promise.allSettled([
      // Важно: имена полей должны точно совпадать со схемой profiles.
      // Реальные поля (см. migrations): full_name, birth_date, region,
      // military_commissariat, education_institution, work_place.
      supabase
        .from("profiles")
        .select(
          "full_name, birth_date, region, city, military_commissariat, education_institution, education_specialty, work_place, work_position",
        )
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("medical_documents_v2")
        .select(
          "id, title, document_date, document_type_id, document_subtype_id, raw_text, ai_fitness_category, ai_category_chance, ai_recommendations, ai_explanation, meta, document_types(name), document_subtypes(name)",
        )
        .eq("user_id", userId)
        .order("document_date", { ascending: false }),
      supabase
        .from("document_article_links")
        .select(
          "document_id, article_id, ai_category_chance, ai_fitness_category, ai_explanation, ai_recommendations, disease_articles_565(article_number, title)",
        ),
      supabase
        .from("case_events")
        .select("event_date, event_type, title, description, outcome")
        .eq("user_id", userId)
        .order("event_date", { ascending: false })
        .limit(10),
    ]);

    // Динамические данные из БД — типизация any упрощает доступ к полям,
    // и любая ошибка одного запроса не валит весь контекст.
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const unwrap = (s: PromiseSettledResult<{ data?: any; error?: unknown }>): any =>
      s.status === "fulfilled" && !s.value.error ? (s.value.data ?? null) : null;

    const profile: any = unwrap(profileSet);
    const docs: any[] = unwrap(docsSet) || [];
    const links: any[] = unwrap(linksSet) || [];
    const events: any[] = unwrap(eventsSet) || [];
    /* eslint-enable @typescript-eslint/no-explicit-any */

    let context = "";

    // ── 1. Профиль ─────────────────────────────────────────────────────
    if (profile) {
      const p = profile as Record<string, string | null | undefined>;
      context += "=== ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ ===\n";
      if (p.full_name) context += `ФИО: ${p.full_name}\n`;
      if (p.birth_date) {
        const age = Math.floor(
          (now.getTime() - new Date(p.birth_date).getTime()) / (1000 * 60 * 60 * 24 * 365.25),
        );
        context += `Дата рождения: ${p.birth_date} (возраст ${age} лет)\n`;
      }
      if (p.city || p.region) context += `Регион: ${[p.city, p.region].filter(Boolean).join(", ")}\n`;
      if (p.military_commissariat) context += `Военкомат: ${p.military_commissariat}\n`;
      if (p.education_institution)
        context += `Образование: ${p.education_institution}${p.education_specialty ? ` (${p.education_specialty})` : ""}\n`;
      if (p.work_place)
        context += `Работа: ${p.work_place}${p.work_position ? `, ${p.work_position}` : ""}\n`;
      context += "\n";
    }

    // ── 2. Документы + опросник ────────────────────────────────────────
    if (docs.length > 0) {
      const questionnaire = docs.find(
        (d) => (d.meta as Record<string, unknown> | null)?.is_questionnaire === true,
      );

      if (questionnaire?.raw_text) {
        context += "=== МЕДИЦИНСКИЙ ОПРОСНИК (заполнен пользователем) ===\n";
        context += questionnaire.raw_text.substring(0, 3500);
        context += "\n\n";
      }

      const medicalDocs = docs.filter(
        (d) => (d.meta as Record<string, unknown> | null)?.is_questionnaire !== true,
      );

      const linksByDoc = new Map<string, typeof links>();
      for (const link of links) {
        const arr = linksByDoc.get(link.document_id) || [];
        arr.push(link);
        linksByDoc.set(link.document_id, arr);
      }

      context += "=== МЕДИЦИНСКИЕ ДОКУМЕНТЫ ===\n\n";
      const articleBestChance = new Map<
        string,
        { chance: number; articleNum: string; title: string }
      >();

      for (const doc of medicalDocs) {
        const typeName =
          (doc as { document_types?: { name?: string } | null }).document_types?.name ||
          "Не указан";
        const subtypeName = (doc as { document_subtypes?: { name?: string } | null })
          .document_subtypes?.name;
        const docTitle = doc.title || "Без названия";

        let dateLine = "Дата не указана";
        if (doc.document_date) {
          const docDate = new Date(doc.document_date);
          const ageMonths = differenceInMonths(now, docDate);
          dateLine = `${format(docDate, "dd.MM.yyyy")}${ageMonths > 0 ? ` (давность: ${ageMonths} мес.)` : ""}${ageMonths > 6 ? " ⚠️ УСТАРЕЛ" : ""}`;
        }

        context += `Документ: ${docTitle}\n`;
        context += `Тип: ${typeName}${subtypeName ? ` / ${subtypeName}` : ""}\n`;
        context += `Дата: ${dateLine}\n`;

        const docLinks = linksByDoc.get(doc.id) || [];
        for (const link of docLinks) {
          const article = (link as { disease_articles_565?: { article_number: string; title: string } | null })
            .disease_articles_565;
          if (!article) continue;
          const chance = link.ai_category_chance || 0;
          context += `  Статья ${article.article_number} (${article.title}) — сила документальных подтверждений: ${chance}/100 (не вероятность решения комиссии)\n`;
          if (link.ai_explanation) {
            context += `    Обоснование: ${String(link.ai_explanation).slice(0, 300)}\n`;
          }
          if (link.ai_recommendations && link.ai_recommendations.length > 0) {
            context += `    Рекомендации: ${link.ai_recommendations.join("; ").slice(0, 300)}\n`;
          }
          const existing = articleBestChance.get(link.article_id);
          if (!existing || chance > existing.chance) {
            articleBestChance.set(link.article_id, {
              chance,
              articleNum: article.article_number,
              title: article.title,
            });
          }
        }
        context += "\n";
      }

      context += `Всего документов: ${medicalDocs.length}\n`;
      const sortedArticles = [...articleBestChance.values()]
        .sort((a, b) => b.chance - a.chance)
        .slice(0, 5);
      if (sortedArticles.length > 0) {
        context += `Статьи с наибольшим шансом кат. В: ${sortedArticles
          .map((a) => `Ст.${a.articleNum} (${a.chance}%)`)
          .join(", ")}\n`;
      }
      const oldDocs = medicalDocs.filter(
        (d) => d.document_date && differenceInMonths(now, new Date(d.document_date)) > 6,
      );
      if (oldDocs.length > 0) {
        context += `\n⚠️ ${oldDocs.length} из ${medicalDocs.length} документов старше 6 месяцев — рекомендуется обновить обследования.\n`;
      }
      context += "\n";
    }

    // ── 3. События дела ────────────────────────────────────────────────
    if (events.length > 0) {
      context += "=== ЭТАПЫ ДЕЛА (последние события) ===\n";
      const EVENT_TYPES: Record<string, string> = {
        commission: "Призывная комиссия",
        appeal: "Обжалование",
        court: "Суд",
        medical: "Медицинское освидетельствование",
        document: "Подача документов",
        other: "Другое",
      };
      const OUTCOMES: Record<string, string> = {
        positive: "положительный",
        negative: "отрицательный",
        pending: "в ожидании",
      };
      for (const ev of events) {
        const typeLabel = EVENT_TYPES[ev.event_type] || ev.event_type;
        const outcomeLabel = ev.outcome ? OUTCOMES[ev.outcome] || ev.outcome : "—";
        context += `${ev.event_date} · ${typeLabel} · ${ev.title} · исход: ${outcomeLabel}\n`;
        if (ev.description) context += `  ${ev.description.substring(0, 250)}\n`;
      }
      context += "\n";
    }

    return context.substring(0, MAX_CONTEXT_CHARS);
  } catch (err) {
    console.error("buildAIContext error", err);
    return "";
  }
}
