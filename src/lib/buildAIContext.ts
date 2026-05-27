import { supabase } from "@/integrations/supabase/client";
import { differenceInMonths, format } from "date-fns";

// 100k оставляет запас 20k до серверного лимита 120k в chat edge-функции.
// Опросник один может занимать до 6k, профиль ~500, документы — основная масса.
const MAX_CONTEXT_CHARS = 100000;

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

    const [profileRes, docsRes, linksRes, eventsRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, birth_date, gender, region, military_office_name, education_level, work_status")
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

    const profile = profileRes.data;
    const docs = docsRes.data || [];
    const links = linksRes.data || [];
    const events = eventsRes.data || [];

    let context = "";

    // ── 1. Профиль ─────────────────────────────────────────────────────
    if (profile) {
      context += "=== ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ ===\n";
      if (profile.full_name) context += `ФИО: ${profile.full_name}\n`;
      if (profile.birth_date) {
        const age = Math.floor(
          (now.getTime() - new Date(profile.birth_date).getTime()) /
            (1000 * 60 * 60 * 24 * 365.25),
        );
        context += `Дата рождения: ${profile.birth_date} (возраст ${age} лет)\n`;
      }
      if (profile.gender) context += `Пол: ${profile.gender}\n`;
      if (profile.region) context += `Регион: ${profile.region}\n`;
      if (profile.military_office_name)
        context += `Военкомат: ${profile.military_office_name}\n`;
      if (profile.education_level) context += `Образование: ${profile.education_level}\n`;
      if (profile.work_status) context += `Работа/учёба: ${profile.work_status}\n`;
      context += "\n";
    }

    // ── 2. Документы + опросник ────────────────────────────────────────
    if (docs.length > 0) {
      const questionnaire = docs.find(
        (d) => (d.meta as Record<string, unknown> | null)?.is_questionnaire === true,
      );

      if (questionnaire?.raw_text) {
        context += "=== МЕДИЦИНСКИЙ ОПРОСНИК (заполнен пользователем) ===\n";
        context += questionnaire.raw_text.substring(0, 6000);
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
          context += `  Статья ${article.article_number} (${article.title}) — шанс кат. В: ${chance}%\n`;
          if (link.ai_explanation) {
            context += `    Обоснование: ${link.ai_explanation}\n`;
          }
          if (link.ai_recommendations && link.ai_recommendations.length > 0) {
            context += `    Рекомендации: ${link.ai_recommendations.join("; ")}\n`;
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
