import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { searchByArticles, renderChunks } from "../_shared/ragSearch.ts";
import { MODEL_VISION } from "../_shared/llmGateway.ts";

const getAllowedOrigin = (req?: Request) => {
  const requestOrigin = req?.headers.get("origin") || "";
  const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN") || "";
  if (allowedOrigin && requestOrigin === allowedOrigin) return requestOrigin;
  if (requestOrigin === "https://nepriziv.ru" || requestOrigin === "https://www.nepriziv.ru") return requestOrigin;
  if (requestOrigin.endsWith(".lovable.app")) return requestOrigin;
  if (requestOrigin.startsWith("http://localhost")) return requestOrigin;
  return allowedOrigin || "*";
};

const getCorsHeaders = (req?: Request) => ({
  "Access-Control-Allow-Origin": getAllowedOrigin(req),
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
});

// Retry helper with exponential backoff for image processing errors
async function callAIWithRetry(url: string, options: RequestInit, maxRetries: number = 3): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`AI API call attempt ${attempt}/${maxRetries}`);
      const response = await fetch(url, options);

      // If response is OK, return it
      if (response.ok) {
        return response;
      }

      // For non-retriable errors, return immediately
      if (response.status === 429 || response.status === 402) {
        return response;
      }

      // Check if it's an image processing error (retriable)
      const errorText = await response.text();
      console.error(`AI API error (attempt ${attempt}):`, response.status, errorText);

      const isImageProcessingError =
        errorText.includes("Unable to process input image") ||
        errorText.includes("Could not process image") ||
        errorText.includes("Invalid image") ||
        (response.status === 400 && errorText.toLowerCase().includes("image"));

      if (isImageProcessingError && attempt < maxRetries) {
        // Wait with exponential backoff: 1s, 2s, 4s
        const delayMs = Math.pow(2, attempt - 1) * 1000;
        console.log(`Image processing error, retrying in ${delayMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      // Non-retriable error or last attempt
      throw new Error(`AI API error: ${response.status} - ${errorText}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        const delayMs = Math.pow(2, attempt - 1) * 1000;
        console.log(`Request failed, retrying in ${delayMs}ms...`, lastError.message);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError || new Error("All retry attempts failed");
}

const ASTHMA_ICD_RE = /\bJ\s*45(?:\s*[\.,]\s*\d)?\b/i;
const CONCRETE_ASTHMA_ICD_RE = /\bJ\s*45\s*[\.,]\s*\d\b/i;
const ASTHMA_ABBREVIATION_RE = /(?:^|[^А-Яа-яЁёA-Za-z])БА(?:$|[^А-Яа-яЁёA-Za-z])/u;
const ASTHMA_WORD_RE = /бронхиальн[а-яё]*\s+астм[а-яё]*|(?:^|[^А-Яа-яЁёA-Za-z])астм[а-яё]*/iu;
const ASTHMA_DEBUT_RE = /дебют|впервые\s+выявлен/iu;
const ASTHMA_OBJECTIVE_SUPPORT_RE =
  /госпитализац|стационар|скор(?:ая|ой)|\bФВД\b|спирометр|ОФВ\s*1|бронхолитическ[а-яё]*\s+проб|проб[а-яё]*\s+с\s+бронхолит|пик[-\s]?флоу|метахолин|диспансерн|льготн[а-яё]*\s+(?:категор|рецепт)/iu;
const ALLERGIC_RHINITIS_RE =
  /\bJ\s*30(?:\s*[\.,]\s*\d)?\b|аллергическ[а-яё]*\s+ринит|поллиноз|сенсибилизац/iu;
const POLYPOSIS_SINUS_SOURCE_RE =
  /\bJ\s*33(?:\s*[\.,]\s*\d)?\b|полип|синусит|гайморит|риносинусит|пансинусит|пазух|сосудосужива|обонян/iu;
const POLYPOSIS_SINUS_ADVICE_RE =
  /полип|j\s*33|синусит|гайморит|риносинусит|кт\s+.*пазух|пазух.*кт|околоносов|придаточн[а-яё]*\s+пазух|лор[-\s]?врач|эндоскопическ[а-яё]*\s+исследован[а-яё]*\s+полости\s+носа|сосудосужива|обонян/iu;

const normalizeText = (value: unknown): string => String(value ?? "").replace(/\s+/g, " ").trim();

const normalizeArticleNumber = (value: unknown): string => {
  const match = String(value ?? "").match(/\d+/);
  return match?.[0] ?? "";
};

const numericChance = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const extractAsthmaIcdCode = (text: string): string | null => {
  const match = text.match(/\bJ\s*45(?:\s*[\.,]\s*(\d))?\b/i);
  if (!match) return null;
  return match[1] ? `J45.${match[1]}` : "J45";
};

const hasAsthmaEvidence = (text: string): boolean =>
  ASTHMA_ICD_RE.test(text) || ASTHMA_ABBREVIATION_RE.test(text) || ASTHMA_WORD_RE.test(text);

const hasAllergicRhinitisWithoutPolypSinusEvidence = (text: string): boolean =>
  ALLERGIC_RHINITIS_RE.test(text) && !POLYPOSIS_SINUS_SOURCE_RE.test(text);

const isFalseAsthmaIcdGap = (message: string, sourceText: string): boolean => {
  if (!CONCRETE_ASTHMA_ICD_RE.test(sourceText)) return false;

  const msg = normalizeText(message).toLowerCase();
  const complainsAboutCode =
    /(?:нет|отсутств|не указан[ао]?|не хватает)\s+(?:кода?\s*)?(?:мкб|j\s*45|код)/i.test(msg) ||
    /(?:уточнить|добавить|указать)\s+(?:код\s*)?(?:мкб|j\s*45|код)/i.test(msg) ||
    /j\s*45\s*(?:[\.,]\s*)?[xх]\b/i.test(msg);
  const mentionsAsthma = /астм|бронхиальн|j\s*45/i.test(msg);

  return complainsAboutCode && mentionsAsthma;
};

const isIrrelevantPolypSinusAdvice = (message: string, sourceText: string): boolean => {
  if (!ALLERGIC_RHINITIS_RE.test(sourceText)) return false;
  if (POLYPOSIS_SINUS_SOURCE_RE.test(sourceText)) return false;
  return POLYPOSIS_SINUS_ADVICE_RE.test(message);
};

const cleanIrrelevantDocumentAdvice = (items: unknown, sourceText: string): string[] => {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .filter((item) => !isFalseAsthmaIcdGap(item, sourceText))
    .filter((item) => !isIrrelevantPolypSinusAdvice(item, sourceText));
};

const normalizeAsthmaAnalysisResult = (result: Record<string, any>): Record<string, any> => {
  const extractedText = normalizeText(result.extractedText);
  if (!extractedText || !hasAsthmaEvidence(extractedText)) {
    return result;
  }

  const asthmaCode = extractAsthmaIcdCode(extractedText);
  const hasDebut = ASTHMA_DEBUT_RE.test(extractedText);
  const hasObjectiveSupport = ASTHMA_OBJECTIVE_SUPPORT_RE.test(extractedText);
  const normalizedDiagnosis = `Бронхиальная астма${hasDebut ? ", дебют" : ""}${asthmaCode ? ` (${asthmaCode})` : ""}`;
  const asthmaChance = hasDebut ? (hasObjectiveSupport ? 65 : 60) : 80;
  const asthmaMaxChance = hasDebut ? 65 : 100;
  const asthmaCategory = hasDebut ? "Г" : "В";

  if (!Array.isArray(result.linkedArticles)) {
    result.linkedArticles = [];
  }

  const linkedArticles = result.linkedArticles as Array<Record<string, any>>;
  const hasSecondaryRhinitisOnly = hasAllergicRhinitisWithoutPolypSinusEvidence(extractedText);
  for (const article of linkedArticles) {
    article.recommendations = cleanIrrelevantDocumentAdvice(article?.recommendations, extractedText);
    if (hasSecondaryRhinitisOnly && normalizeArticleNumber(article?.articleNumber) === "49") {
      if (numericChance(article.categoryBChance) > 20) {
        article.categoryBChance = 20;
      }
      if (["В", "Г", "Д"].includes(String(article.fitnessCategory))) {
        article.fitnessCategory = "Б";
      }
      const explanation = normalizeText(article.explanation);
      const secondaryNote =
        "Аллергический ринит/поллиноз J30.x в этом документе является вторичным диагнозом и не подтверждает полипозный синусит J33.x.";
      article.explanation = explanation && !explanation.includes(secondaryNote)
        ? `${explanation} ${secondaryNote}`
        : explanation || secondaryNote;
    }
  }

  const existingAsthma = linkedArticles.find((article) => {
    const articleNumber = normalizeArticleNumber(article?.articleNumber);
    const diagnosis = normalizeText(article?.diagnosisFound);
    return articleNumber === "52" || ASTHMA_ICD_RE.test(diagnosis) || ASTHMA_WORD_RE.test(diagnosis);
  });

  const asthmaExplanation =
    `В тексте документа есть формулировка "${ASTHMA_ABBREVIATION_RE.test(extractedText) ? "БА" : "астма"}"` +
    `${asthmaCode ? ` и код МКБ-10 ${asthmaCode}` : ""}: это относится к бронхиальной астме по статье 52 Расписания болезней.` +
    (hasDebut
      ? " Пометка «дебют» означает впервые выявленное заболевание, а не отсутствие диагноза; без истории наблюдения, госпитализаций или объективных ФВД это предварительно даёт умеренный шанс категории В, примерно 55-65%."
      : "");

  if (existingAsthma) {
    existingAsthma.articleNumber = "52";
    existingAsthma.diagnosisFound = normalizeText(existingAsthma.diagnosisFound) || normalizedDiagnosis;
    if (!/бронхиальн|астм|j\s*45/i.test(existingAsthma.diagnosisFound)) {
      existingAsthma.diagnosisFound = normalizedDiagnosis;
    } else if (asthmaCode && !new RegExp(asthmaCode.replace(".", "\\."), "i").test(existingAsthma.diagnosisFound)) {
      existingAsthma.diagnosisFound = `${existingAsthma.diagnosisFound} (${asthmaCode})`;
    }
    if (!existingAsthma.explanation || isFalseAsthmaIcdGap(existingAsthma.explanation, extractedText)) {
      existingAsthma.explanation = asthmaExplanation;
    }
    if (typeof existingAsthma.categoryBChance !== "number") {
      existingAsthma.categoryBChance = asthmaChance;
    } else if (existingAsthma.categoryBChance < asthmaChance) {
      existingAsthma.categoryBChance = asthmaChance;
    } else if (existingAsthma.categoryBChance > asthmaMaxChance) {
      existingAsthma.categoryBChance = asthmaMaxChance;
    }
    if (!existingAsthma.fitnessCategory || !["В", "Д"].includes(String(existingAsthma.fitnessCategory))) {
      existingAsthma.fitnessCategory = asthmaCategory;
    }
  } else {
    linkedArticles.push({
      articleNumber: "52",
      diagnosisFound: normalizedDiagnosis,
      fitnessCategory: asthmaCategory,
      categoryBChance: asthmaChance,
      explanation: asthmaExplanation,
      recommendations: [
        "Сохранить заключение аллерголога/пульмонолога с диагнозом бронхиальная астма и кодом J45.x.",
        "Пройти ФВД/спирометрию с бронхолитиком для объективного подтверждения бронхиальной обструкции.",
      ],
    });
  }

  const currentChance = numericChance(result.categoryBChance);
  if (currentChance < asthmaChance) {
    result.primaryArticleNumber = "52";
    result.categoryBChance = asthmaChance;
    if (!["В", "Д"].includes(String(result.fitnessCategory))) {
      result.fitnessCategory = asthmaCategory;
    }
  }

  if (hasDebut && normalizeArticleNumber(result.primaryArticleNumber) === "52" && currentChance > asthmaMaxChance) {
    result.categoryBChance = asthmaMaxChance;
    if (!["В", "Д"].includes(String(result.fitnessCategory))) {
      result.fitnessCategory = asthmaCategory;
    }
  }

  const highestArticle = linkedArticles.reduce<Record<string, any> | null>((best, article) => {
    return !best || numericChance(article?.categoryBChance) > numericChance(best?.categoryBChance) ? article : best;
  }, null);
  if (highestArticle) {
    const highestChance = numericChance(highestArticle.categoryBChance);
    const hasAsthmaArticle = linkedArticles.some((article) => normalizeArticleNumber(article?.articleNumber) === "52");
    const asthmaWasOnlyHighSource =
      hasDebut &&
      hasAsthmaArticle &&
      currentChance > highestChance &&
      linkedArticles.every((article) => {
        return normalizeArticleNumber(article?.articleNumber) === "52" || numericChance(article?.categoryBChance) <= asthmaMaxChance;
      });

    if (currentChance < highestChance || asthmaWasOnlyHighSource) {
      result.primaryArticleNumber = normalizeArticleNumber(highestArticle.articleNumber) || result.primaryArticleNumber;
      result.categoryBChance = highestChance;
      if (highestArticle.fitnessCategory) {
        result.fitnessCategory = highestArticle.fitnessCategory;
      }
    }
  }

  const explanation = normalizeText(result.explanation);
  if (explanation && !/бронхиальн|астм|j\s*45/i.test(explanation)) {
    result.explanation = `${explanation} Также в документе учтено: ${asthmaExplanation}`;
  }

  result.documentGaps = cleanIrrelevantDocumentAdvice(result.documentGaps, extractedText);
  result.recommendations = cleanIrrelevantDocumentAdvice(result.recommendations, extractedText);

  return result;
};

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authentication check - require valid JWT
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Требуется аутентификация" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    // Vision-модель OpenAI (читает фото/скан документа). Переключаемо секретом.
    const VISION_MODEL = MODEL_VISION;

    // Verify user token
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser();
    if (authError || !authData?.user) {
      return new Response(JSON.stringify({ error: "Неверный токен авторизации" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { imageBase64, images, documentId, userId, manualText, isHandwritten, lawyerDocId } = await req.json();

    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    // Use service role client for DB operations
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Получаем список типов документов для классификации
    const { data: documentTypes } = await supabase
      .from("document_types")
      .select("id, code, name")
      .eq("is_active", true);

    // Получаем список статей для связывания
    const { data: articles } = await supabase
      .from("disease_articles_565")
      .select("id, article_number, title, category")
      .eq("is_active", true);

    const documentTypesStr = documentTypes?.map((t) => `${t.code}: ${t.name}`).join(", ") || "";
    const articlesStr = articles?.map((a) => `Статья ${a.article_number}: ${a.title}`).join("\n") || "";

    // Базовый промпт с правилами
    const basePrompt = `Ты медицинский эксперт-документовед высшей категории, специализирующийся на анализе медицинских документов для определения годности к военной службе по Постановлению Правительства РФ №565 (Расписание болезней).

КРИТИЧЕСКИ ВАЖНО - МЕДИЦИНСКИЕ СОКРАЩЕНИЯ И КОДЫ МКБ:
- В графе "Диагноз" сокращение "БА" означает "бронхиальная астма", если рядом есть контекст астмы, код J45.x, ингаляционная терапия или аллерголог/пульмонолог. Формулировку "БА, дебют J45.0" распознавай как "бронхиальная астма, дебют, код МКБ-10 J45.0".
- Слово "дебют" при бронхиальной астме означает впервые выявленное/начальное проявление диагноза, а НЕ отсутствие диагноза и НЕ "подозрение", если в документе диагноз указан без вопросительного знака.
- Любой конкретный код J45.0, J45.1, J45.8, J45.9 уже удовлетворяет требованию "J45.x". НЕ пиши, что нужно уточнить J45.x, если в документе уже указан конкретный код J45.0/J45.1/J45.8/J45.9.
- Бронхиальная астма / БА / астма с кодом J45.x относится к статье 52 Расписания болезней. Обязательно добавляй статью 52 в linkedArticles, даже если в том же документе есть аллергический ринит по статье 49.
- Если это "БА, дебют" / впервые выявленная астма и есть только одно заключение частной клиники без госпитализаций, скорой помощи, диспансерного наблюдения или результатов ФВД/спирометрии с бронхолитиком, НЕ ставь высокий шанс 70-90%. Для такого документа указывай умеренный предварительный шанс категории В около 55-65%.
- Аллергический ринит / поллиноз / J30.x НЕ равен полипозному синуситу / J33.x. Если в документе нет J33.x, полипов, синусита/риносинусита, КТ пазух или эндоскопического описания полипов, НЕ требуй КТ придаточных пазух, ЛОР-заключение J33.x, данные о сосудосуживающих каплях, снижении обоняния или подтверждение полипозного синусита. В таких смешанных документах главный фокус отчёта держи на бронхиальной астме J45.x, а ринит/поллиноз упоминай вторично.

КРИТИЧЕСКИ ВАЖНО - ПРАВИЛА ОЦЕНКИ СТЕПЕНЕЙ ЗАБОЛЕВАНИЙ:

СТАТЬЯ 68 (ПЛОСКОСТОПИЕ) - ОБЯЗАТЕЛЬНЫЕ ПРАВИЛА:
- Плоскостопие I степени (продольное или поперечное): НЕ является основанием для освобождения! Категория А или Б. Шанс В = 0-10%
- Продольное плоскостопие II степени: ПРИЗЫВНОЙ диагноз — призывник ГОДЕН (категория Б-3), НЕ освобождает от службы. Шанс В = 0-10%
- Плоскостопие III степени: категория В (ограниченно годен). Шанс В = 70-90%

УГЛЫ ПРОДОЛЬНОГО ПЛОСКОСТОПИЯ (по рентгену стоп в боковой проекции с нагрузкой) — ИМЕННО УГОЛ ОПРЕДЕЛЯЕТ СТЕПЕНЬ:
- I степень: угол продольного свода 131–140°
- II степень: угол продольного свода 141–155° ВКЛЮЧИТЕЛЬНО → ПРИЗЫВНОЙ диагноз, призывник ГОДЕН (категория Б-3)
- III степень: угол продольного свода СТРОГО БОЛЕЕ 155° (то есть 156° и выше) → категория В
КРИТИЧЕСКИ ВАЖНО: угол ровно 155° — это ещё II степень (ГОДЕН), а НЕ III степень! Категорию В по продольному плоскостопию даёт ТОЛЬКО угол строго больше 155°. НЕ округляй значения 141–155° до III степени и не присваивай по ним категорию В.

ЦИТАТА ИЗ СТАТЬИ 68: "Продольное или поперечное плоскостопие I степени не является основанием для применения этой статьи, не препятствует прохождению военной службы и поступлению в военно-учебные заведения."

ПРАВИЛО ДАТ И АКТУАЛЬНОСТИ ДОКУМЕНТОВ (касается ВСЕХ статей, но особенно ст. 68):
- ВСЕГДА сравнивай ДАТЫ обследований и заключений специалистов — состояние пациента со временем меняется.
- При противоречии документов итоговую степень/категорию определяет САМОЕ СВЕЖЕЕ (более позднее по дате) объективное обследование, а не более раннее заключение.
- Пример: заключение ортопеда от 04.10.2025 — продольное плоскостопие III степени левой стопы; рентген стоп с нагрузкой от 26.05.2026 — углы 153° и 142° (II степень). Рентген СВЕЖЕЕ и показывает улучшение → актуальная степень II, призывник ГОДЕН. Присваивать категорию В по устаревшему заключению ортопеда в этом случае НЕЛЬЗЯ.
- В обосновании ОБЯЗАТЕЛЬНО указывай даты документов и поясняй, какой из них приоритетнее и почему.

РАЗДЕЛЕНИЕ РОЛЕЙ ДОКУМЕНТОВ ПО СТ. 68:
- Рентгенолог измеряет углы и высоту свода и фиксирует степень ПО РЕНТГЕНУ, но НЕ ставит клинический диагноз.
- Окончательный диагноз "продольное/поперечное плоскостопие N степени" должен поставить ВРАЧ-ОРТОПЕД на основании рентгена и осмотра.
- Если есть только заключение рентгенолога (углы/степень) без заключения ортопеда — ОБЯЗАТЕЛЬНО отметь в слабых сторонах и рекомендациях, что необходимы консультация и диагноз врача-ортопеда.

СТАТЬЯ 34 (МИОПИЯ / АСТИГМАТИЗМ / НАРУШЕНИЯ РЕФРАКЦИИ) — ОБЯЗАТЕЛЬНЫЕ ПРАВИЛА:
- Категорию по близорукости определяй ТОЛЬКО по ДАННЫМ АВТОРЕФРАКТОМЕТРИИ — сфера (sph) + цилиндр (cyl) по каждому глазу. Это могут быть И «чек»/распечатка прибора с парами sph/cyl по OD и OS: даже если СЛОВА «авторефрактометрия» в тексте НЕТ, числовая таблица sph/cyl по обоим глазам и есть авторефрактометрия — используй её.
- Строку Vis (острота зрения, в т.ч. вида «Vis OD 0.1 c корр. -6.5») НЕЛЬЗЯ брать как значение рефракции/диоптрий. Vis — это острота зрения, а НЕ степень близорукости. Если в документе есть и Vis, и авторефрактометрия — бери ТОЛЬКО авторефрактометрию.
- Считай по СИЛЬНОМУ МЕРИДИАНУ = сфера + ПОЛНЫЙ цилиндр (меридиан наибольшей аметропии), а НЕ сфероэквивалент (sph + ½cyl). Цилиндр до -0.5 включительно — вариант нормы, в сумму НЕ добавляй.
- Порог: близорукость СТРОГО БОЛЕЕ 6.0 дптр (от -6.25) → категория В; ровно -6.0 дптр или слабее → Б-3 (годен). Примеры: sph -6.0 + cyl -0.75 = -6.75 → В; одна sph -6.0 без цилиндра = Б-3.
- Если в документе ТОЛЬКО Vis (без данных авторефрактометра) — данных для ст. 34 НЕДОСТАТОЧНО: НЕ присваивай категорию по Vis, а в рекомендациях укажи сделать авторефрактометрию (желательно в циклоплегии).
- Отсутствие отметки о каплях/циклоплегии встречается ЧАСТО и само по себе НЕ обесценивает данные авторефрактометра — НЕ делай на этом сильный акцент и не занижай из-за этого оценку.

ВАЖНО: Один документ может содержать НЕСКОЛЬКО диагнозов, относящихся к РАЗНЫМ статьям!
Например, выписка может содержать:
- ПМК (пролапс митрального клапана) → Статья 42
- Разрыв связок коленного сустава → Статья 65
- Синусит → Статья 49

Ты должен найти ВСЕ диагнозы и указать ВСЕ соответствующие статьи с отдельными рекомендациями для каждой!`;

    let prompt: string;
    let requestBody: any;

    if (isHandwritten && manualText) {
      // Анализ рукописного документа на основе текста, введённого пользователем
      console.log("Starting handwritten document analysis based on user-entered text");

      // Check if this is a questionnaire (longer text with multiple sections)
      const isQuestionnaire = manualText.length > 500;

      const examinationsList = `ПОЛНЫЙ СПИСОК ДОСТУПНЫХ ОБСЛЕДОВАНИЙ (назначай из этого списка максимально широко):

АНАЛИЗЫ КРОВИ И МОЧИ:
- Клинический анализ крови: общий анализ, лейкоформула, СОЭ
- Клинический анализ мочи
- Общий белок мочи (разовая/суточная)
- Тромбоциты, микроскопия (подсчет по методу Фонио)
- Скорость клубочковой фильтрации (по Кокрофту-Голту)
- Биохимия крови, расширенный профиль
- Посев мочи
- Коагулограмма развернутая
- ТТГ тиреотропный гормон
- Т4 свободный
- Т3 свободный
- Антитела к тиреопероксидазе (АТ-ТПО)
- Антитела к тиреоглобулину (АТ-ТГ)
- Комплексное серологическое исследование: сифилис, ВИЧ, гепатит В (HBsAg), гепатит С (a-HCV)
- Общий иммуноглобулин IgE
- Анализ крови "Фадиатоп"
- Гликированный гемоглобин (HbA1c)
- Пероральный глюкозотолерантный тест (ПТТГ)
- Агрегация тромбоцитов
- Активность фактора фон Виллебранда
- Активность фактора VIII
- Мутация фактора V (Лейденская мутация)
- Мутация гена протромбина G20210A
- Антистрептолизин-О (АСЛ-О)
- С-реактивный белок (СРБ)
- Ревматоидный фактор (РФ)
- Анализ мочи на микроальбуминурию
- Антитела к циклическому цитруллинированному пептиду
- Антиген HLA-B27
- Антинуклеарный фактор (АНФ) на HEp-2 клетках
- Антинуклеарные антитела (АНА, иммуноблот)
- Антинейтрофильные цитоплазматические антитела (АНЦА, ANCA)
- Анализ полиморфизмов в генах F2 и F5
- Расширенное исследование генов системы гемостаза: F2, F5, MTHFR, MTR, MTRR, F13, FGB, ITGA2, ITGB3, F7, PAI-1

ГЕНЕТИЧЕСКИЕ ИССЛЕДОВАНИЯ:
- ДНК-диагностика хореи Гентингтона
- Молекулярно-генетическое исследование при спиноцеребеллярной атаксии
- ДНК-диагностика атаксии Фридрейха
- Генетическая диагностика спинальной мышечной атрофии
- Поиск делеций и дупликаций в гене дистрофина (DMD)
- ДНК-диагностика миотонической дистрофии 1 типа

КОНСУЛЬТАЦИИ ВРАЧЕЙ:
- Консультация врача-дерматолога
- Биопсия кожи при дерматозах
- Гистологическое исследование биоптата кожи

РЕНТГЕНОГРАФИЯ:
- Рентген длинных трубчатых костей
- Рентген стоп в боковой проекции с нагрузкой
- Рентген шейного отдела позвоночника в прямой и боковой проекциях
- Рентген грудного отдела позвоночника в прямой и боковой проекциях
- Рентген поясничного отдела позвоночника в прямой и боковой проекциях
- Рентген крупных суставов в двух проекциях
- Рентгенография нижних конечностей с измерением длины
- Рентгенография органов грудной клетки
- Внутривенная (экскреторная) урография

УЛЬТРАЗВУКОВЫЕ ИССЛЕДОВАНИЯ:
- Эхокардиография
- Эхокардиография с физической нагрузкой (Стресс ЭХО)
- УЗИ щитовидной железы и паращитовидных желез
- УЗИ почек и надпочечников
- УЗИ органов мошонки
- УЗИ органов брюшной полости (комплексное)
- УЗИ щитовидной железы, экспертное
- Дуплексное сканирование сонных и позвоночных артерий
- Дуплексное сканирование экстракраниальных и транскраниальных отделов брахиоцефальных артерий
- Дуплексное сканирование артерий почек
- УЗИ глазного яблока (В-сканирование)

МРТ:
- МРТ головного мозга
- МРТ грудного и поясничного отделов позвоночника
- МРТ коленного сустава (1 сустав)
- МРТ крестца, копчика и крестцово-подвздошных сочленений
- МРТ позвоночника (шейный, грудной, поясничный, крестцовый) один отдел
- МРТ плечевых суставов (1 сустав)

КТ:
- КТ околоносовых пазух
- КТ органов грудной клетки

ФУНКЦИОНАЛЬНАЯ ДИАГНОСТИКА:
- Регистрация и расшифровка электрокардиограммы
- Суточное мониторирование артериального давления 24 часа
- Тредмил-тест (нагрузочная проба)
- Холтеровское мониторирование сердечного ритма (24 часа)
- Электроэнцефалография
- Электронейромиография (ЭНМГ)
- Тилт-тест
- Велоэргометрия
- Вызванные потенциалы различных модальностей
- Спирометрия с проведением бронхолитического теста
- Спирометрия с проведением провокационного теста

ОФТАЛЬМОЛОГИЯ:
- Оптическая когерентная томография (ОКТ) сетчатки
- Офтальмоскопия с медикаментозным расширением зрачка
- Авторефрактометрия в условиях циклоплегии

АУДИОЛОГИЯ:
- Тональная пороговая аудиометрия
- Речевая аудиометрия
- Акустическая импедансометрия

ЛОР:
- Эндоскопическое исследование полости носа

ЭНДОСКОПИЯ:
- Рентгеноскопия пищевода, желудка и двенадцатипёрстной кишки
- Гастроскопия, в т.ч. с биопсией
- Колоноскопия, в т.ч. с биопсией

ДРУГОЕ:
- Радиоизотопные исследования (динамическая нефросцинтиграфия)
- Люмбальная пункция
- Пункция сустава с исследованием синовиальной жидкости`;

      prompt = `${basePrompt}

ЗАДАЧА: Проанализируй информацию, введённую пользователем из ${isQuestionnaire ? "медицинского опросника призывника" : "рукописного медицинского документа"}:

ТЕКСТ ИЗ ДОКУМЕНТА:
${manualText}

${examinationsList}

КРИТИЧЕСКИ ВАЖНО — АЛГОРИТМ АНАЛИЗА ОПРОСНИКА:

ЭТАП 1: Для КАЖДОЙ жалобы или симптома из опросника:
  a) Выдели конкретную жалобу (например: "головные боли", "боли в пояснице", "одышка")
  b) Предположи ВСЕ возможные диагнозы, которые могут вызывать эту жалобу (дифференциальная диагностика)
     Например: "головные боли" → мигрень, внутричерепная гипертензия, остеохондроз шейного отдела, сосудистая патология, новообразование
  c) Для КАЖДОГО предполагаемого диагноза определи МИНИМАЛЬНЫЙ набор обследований для подтверждения/исключения

ЭТАП 2: Объедини все обследования из всех диагнозов, убрав дубликаты.

ЭТАП 3: Сгруппируй итоговые рекомендации по категориям:
  - Анализы крови и мочи
  - Инструментальные обследования (МРТ, КТ, рентген, УЗИ, ЭКГ и т.д.)
  - Консультации врачей-специалистов

ПРАВИЛА РЕКОМЕНДАЦИЙ:
1. НЕ рекомендуй лечение, терапию, приём препаратов или курсы лечения!
2. Рекомендуй ТОЛЬКО обследования, анализы и консультации врачей из списка выше.
3. Назначай МАКСИМАЛЬНО ШИРОКИЙ перечень обследований — лучше назначить больше, чем пропустить важное.
4. Формат: указывай ТОЛЬКО название (например: "Клинический анализ крови", "МРТ головного мозга", "Консультация невролога")
5. Чем больше жалоб — тем шире должен быть список обследований.

На основе этого текста выполни следующее:

1. ОПРЕДЕЛЕНИЕ ТИПА ДОКУМЕНТА:
   Выбери наиболее подходящий тип из списка:
   ${documentTypesStr}
   
   Если не подходит ни один - выбери "other" или "unknown"

2. СВЯЗЬ СО СТАТЬЯМИ РАСПИСАНИЯ БОЛЕЗНЕЙ (МНОЖЕСТВЕННАЯ!):
   Определи ВСЕ статьи Постановления №565, к которым относятся диагнозы/жалобы в документе:
   ${articlesStr}
   
   ВАЖНО! Правильное соответствие статей и заболеваний:
   - Статья 42: Ревматизм, болезни сердца (ПМК, пороки клапанов)
   - Статья 49: Болезни носа и придаточных пазух (синусит, гайморит, ринит)
   - Статья 57: Болезни КИШЕЧНИКА
   - Статья 58: Болезни ПЕЧЕНИ, желчного пузыря, поджелудочной железы
   - Статья 59: Грыжи
   - Статья 65: Болезни и повреждения суставов, связок (разрыв связок, артрит)
   - Статья 68: Плоскостопие и деформации стоп
   
   Для КАЖДОГО найденного диагноза/жалобы укажи соответствующую статью!

3. КАТЕГОРИЯ ГОДНОСТИ (для основного диагноза):
   Определи предварительную категорию годности:
   - А - годен (норма, заболевания I степени)
   - Б - годен с ограничениями (минимальные отклонения)
   - В - ограниченно годен (хронические заболевания II-III степени)
   - Г - временно не годен
   - Д - не годен

4. ШАНС НЕПРИЗЫВНОЙ КАТЕГОРИИ (В):
   ВАЖНЕЙШИЕ ИСКЛЮЧЕНИЯ (ШАНС БЛИЗОК К 0%):
   - Плоскостопие I степени: 0-10%
   - Продольное плоскостопие II степени: 0-10% (ПРИЗЫВНОЙ диагноз, годен)
   - Сколиоз I степени: 0-10%

   СРЕДНИЙ ШАНС (40-60%):
   - Сколиоз II степени: 50-65%
   
   ВЫСОКИЙ ШАНС (70-90%):
   - Плоскостопие III степени: 75-90%
   - Сколиоз III степени: 80-95%

5. РЕКОМЕНДАЦИИ ДЛЯ КАЖДОЙ СТАТЬИ:
   Указывай конкретные обследования, анализы и консультации из списка выше.
   НЕ УКАЗЫВАЙ лечение!

Верни результат СТРОГО в формате JSON:
{
  "extractedText": "повтор введённого пользователем текста",
  "documentDate": null,
  "documentTypeCode": "код типа документа",
  "diagnosticReasoning": [
    {
      "complaint": "конкретная жалоба пациента",
      "possibleDiagnoses": ["диагноз 1", "диагноз 2", "диагноз 3"],
      "requiredExaminations": ["обследование 1", "обследование 2"]
    }
  ],
  "linkedArticles": [
    {
      "articleNumber": "номер статьи",
      "diagnosisFound": "какой диагноз/жалоба относится к этой статье",
      "fitnessCategory": "А, Б, В, Г или Д",
      "categoryBChance": число от 0 до 100,
      "explanation": "обоснование для этой статьи",
      "recommendations": ["обследование 1", "обследование 2", "Консультация специалиста"]
    }
  ],
  "primaryArticleNumber": "номер основной статьи (с максимальным шансом В)",
  "fitnessCategory": "А, Б, В, Г или Д (общая)",
  "categoryBChance": число от 0 до 100 (максимальное из всех),
  "explanation": "общее обоснование с перечислением ключевых жалоб и предполагаемых диагнозов",
  "recommendations": ["ПОЛНЫЙ ОБЪЕДИНЁННЫЙ список ВСЕХ обследований из ВСЕХ жалоб и диагнозов, без дубликатов"],
  "suggestedTitle": "предложенное название документа"
}`;

      requestBody = {
        model: VISION_MODEL,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        response_format: { type: "json_object" },
      };
    } else {
      // Обычный анализ документа с изображением
      console.log("Starting comprehensive medical document analysis with OpenAI");

      prompt = `${basePrompt}

ЗАДАЧА: Проанализируй этот медицинский документ и выполни следующие действия:

1. ИЗВЛЕЧЕНИЕ ТЕКСТА (OCR):
   Извлеки ВЕСЬ текст из документа максимально точно, включая:
   - Название медицинского учреждения
   - Дата документа (в формате YYYY-MM-DD если возможно определить)
   - ФИО пациента
   - Все результаты анализов/обследований с числовыми значениями
   - Диагнозы (коды МКБ-10 если есть)
   - Заключения врачей
   - Рекомендации
   - Подписи и печати

2. ОПРЕДЕЛЕНИЕ ТИПА ДОКУМЕНТА:
   Выбери наиболее подходящий тип из списка:
   ${documentTypesStr}
   
   Если не подходит ни один - выбери "other" или "unknown"

3. ОПРЕДЕЛЕНИЕ ДАТЫ ДОКУМЕНТА:
   Найди дату создания/выдачи документа и верни в формате YYYY-MM-DD

4. СВЯЗЬ СО СТАТЬЯМИ РАСПИСАНИЯ БОЛЕЗНЕЙ (МНОЖЕСТВЕННАЯ!):
   Определи ВСЕ статьи Постановления №565, к которым относятся диагнозы в документе:
   ${articlesStr}
   
   ВАЖНО! Правильное соответствие статей и заболеваний:
   - Статья 42: Ревматизм, болезни сердца (ПМК - пролапс митрального клапана, пороки клапанов, аритмии)
   - Статья 49: Болезни носа и придаточных пазух (синусит, гайморит, полипы носа, хронический ринит)
   - Статья 57: Болезни КИШЕЧНИКА (эрозивный илеит, болезнь Крона, неспецифический язвенный колит, хронический колит, проктит, сигмоидит, энтерит, колоноскопия с патологией)
   - Статья 58: Болезни ПЕЧЕНИ, желчного пузыря, поджелудочной железы (гепатит, холецистит, панкреатит, цирроз)
   - Статья 59: Грыжи (паховая, пупочная, бедренная, послеоперационная грыжа)
   - Статья 65: Болезни и повреждения крупных суставов, связок (разрыв связок, нестабильность сустава, привычный вывих, артрит, артроз крупных суставов)
   - Статья 68: Плоскостопие и деформации стоп
   
   НЕ ПУТАЙ: Колоноскопия, илеит, колит = Статья 57 (кишечник), НЕ статья 59!
   
   Для КАЖДОГО найденного диагноза укажи соответствующую статью!

5. КАТЕГОРИЯ ГОДНОСТИ:
   Определи предварительную категорию годности к военной службе:
   - А - годен к военной службе (норма, заболевания I степени)
   - Б - годен с незначительными ограничениями (минимальные отклонения, плоскостопие I степени)
   - В - ограниченно годен (НЕ подлежит призыву в мирное время) - при хронических заболеваниях II-III степени
   - Г - временно не годен (острые заболевания, требующие лечения)
   - Д - не годен к военной службе (тяжёлые патологии)

6. ШАНС НЕПРИЗЫВНОЙ КАТЕГОРИИ (В) для каждой статьи:
   ВАЖНЕЙШИЕ ИСКЛЮЧЕНИЯ (ШАНС БЛИЗОК К 0%):
   - Плоскостопие I степени: 0-10% (НЕ освобождает от службы!)
   - Продольное плоскостопие II степени: 0-10% (ПРИЗЫВНОЙ диагноз, годен — НЕ освобождает от службы!)
   - Сколиоз I степени (до 10°): 0-10%
   - Близорукость до -6 диоптрий: 0-10%
   - Анализы в пределах нормы: 0%

   СРЕДНИЙ ШАНС (40-60%):
   - Сколиоз II степени (11-25°): 50-65%
   - ПМК с регургитацией: 40-60%
   
   ВЫСОКИЙ ШАНС (70-90%):
   - Плоскостопие III степени: 75-90%
   - Сколиоз III степени (более 25°): 80-95%
   - Грыжи межпозвонковых дисков с неврологической симптоматикой: 75-90%
   - Разрыв связок с нестабильностью сустава: 60-80%

7. РЕКОМЕНДАЦИИ ДЛЯ КАЖДОЙ СТАТЬИ:
   Укажи конкретные рекомендации:
   - Какие СПЕЦИАЛИСТЫ нужны для подтверждения диагноза
   - Какие дополнительные обследования требуются
   - Какие документы ещё нужно собрать

Верни результат СТРОГО в формате JSON:
{
  "extractedText": "полный извлечённый текст документа",
  "documentDate": "YYYY-MM-DD или null если не определена",
  "documentTypeCode": "код типа документа",
  "linkedArticles": [
    {
      "articleNumber": "номер статьи (только число)",
      "diagnosisFound": "какой конкретно диагноз из документа относится к этой статье",
      "fitnessCategory": "А, Б, В, Г или Д",
      "categoryBChance": число от 0 до 100,
      "explanation": "обоснование выбора статьи и категории (2-3 предложения)",
      "recommendations": ["Рекомендация 1 для этой статьи", "Рекомендация 2"]
    }
  ],
  "primaryArticleNumber": "номер основной статьи с максимальным шансом категории В",
  "fitnessCategory": "А, Б, В, Г или Д (общая категория по худшему диагнозу)",
  "categoryBChance": число от 0 до 100 (максимальное из всех статей),
  "explanation": "общее обоснование (3-5 предложений)",
  "recommendations": [
    "Общая рекомендация 1",
    "Общая рекомендация 2",
    "Общая рекомендация 3"
  ],
  "suggestedTitle": "предложенное название документа на основе содержания"
}`;

      // Собираем страницы: новый параметр images[] (все страницы ОДНОГО документа)
      // с обратной совместимостью со старым одиночным imageBase64.
      const rawImages: string[] = (Array.isArray(images) && images.length ? images : [imageBase64])
        .filter((x: unknown): x is string => typeof x === "string" && x.length > 0)
        .slice(0, 6); // ограничиваем стоимость/размер запроса к ИИ

      const cleanImages = rawImages
        .map((img: string) => (img.includes("base64,") ? img.split("base64,")[1] : img).replace(/\s/g, ""))
        .filter((b: string) => b && b.length >= 100);

      if (cleanImages.length === 0) {
        throw new Error("Invalid image data: base64 string is too short or empty");
      }

      // Проверяем валидность base64 на первой странице
      try {
        atob(cleanImages[0].substring(0, 100));
      } catch (e) {
        console.error("Invalid base64 encoding");
        throw new Error("Invalid base64 image data");
      }
      console.log("Images for analysis:", cleanImages.length, "first length:", cleanImages[0].length);

      // При нескольких страницах просим ИИ анализировать их как единый документ.
      const promptForPages = cleanImages.length > 1
        ? prompt + "\n\nВНИМАНИЕ: ниже НЕСКОЛЬКО страниц ОДНОГО медицинского документа. Проанализируй их ВМЕСТЕ как единый документ, объединяя диагнозы и данные со всех страниц."
        : prompt;

      requestBody = {
        model: VISION_MODEL,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: promptForPages },
              ...cleanImages.map((b: string) => ({
                type: "image_url",
                image_url: { url: `data:image/jpeg;base64,${b}` },
              })),
            ],
          },
        ],
        response_format: { type: "json_object" },
      };
    }

    // Use retry mechanism for AI API calls (especially for image processing)
    let response: Response;
    try {
      response = await callAIWithRetry(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        },
        3, // max 3 retries
      );
    } catch (retryError) {
      console.error("All AI API retry attempts failed:", retryError);

      // Check if it was an image processing error
      const errorMessage = retryError instanceof Error ? retryError.message : String(retryError);
      if (errorMessage.includes("image") || errorMessage.includes("Unable to process")) {
        return new Response(
          JSON.stringify({
            error: "image_processing_error",
            message:
              "Не удалось распознать изображение. Попробуйте загрузить документ в другом формате (JPG, PNG) или используйте режим ручного ввода для рукописных документов.",
          }),
          {
            status: 422,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      throw retryError;
    }

    // Handle specific error responses
    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({
            error: "rate_limit",
            message: "Превышен лимит запросов. Попробуйте позже.",
          }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      if (response.status === 402) {
        return new Response(
          JSON.stringify({
            error: "payment_required",
            message: "Требуется пополнение баланса AI.",
          }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const errorText = await response.text();
      console.error("AI API error:", response.status, errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    let result;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      result = JSON.parse(jsonMatch ? jsonMatch[0] : content);
      result = normalizeAsthmaAnalysisResult(result);
    } catch (e) {
      // ВАЖНО: раньше сюда подставлялся fallback-объект и документ ниже помечался
      // is_classified = true — пользователь видел «успешный» анализ с фиктивным
      // результатом. Вместо этого возвращаем ошибку и НЕ трогаем документ в БД,
      // чтобы клиент показал ошибку и позволил повторить анализ.
      console.error("Failed to parse JSON:", e, "Content:", content);
      return new Response(
        JSON.stringify({
          error: "parse_error",
          message: "Не удалось разобрать ответ ИИ. Попробуйте повторить анализ.",
        }),
        {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ── RAG-обогащение: сверяем документ с экспертными требованиями базы знаний ──
    // По найденным статьям тянем из rag_chunks («второй мозг») чек-листы/требования
    // к оформлению и просим ИИ указать, чего НЕ ХВАТАЕТ именно в этом документе.
    // Аддитивно и fail-open: любая ошибка не ломает основной анализ.
    try {
      const articleNums: string[] = [];
      if (Array.isArray(result.linkedArticles)) {
        for (const a of result.linkedArticles) {
          if (a?.articleNumber != null) articleNums.push(String(a.articleNumber));
        }
      }
      if (result.primaryArticleNumber) articleNums.push(String(result.primaryArticleNumber));

      const knowledge = await searchByArticles(supabase, articleNums, 6);
      if (knowledge.length && result.extractedText) {
        const checklistText = renderChunks(knowledge, 900);
        const gapPrompt = `Ты — эксперт по военно-врачебной экспертизе. Ниже ТЕКСТ медицинского документа призывника и ЭКСПЕРТНЫЕ ТРЕБОВАНИЯ к оформлению документов по соответствующим статьям Расписания болезней (из базы знаний юриста).

Сверь документ с требованиями и верни СТРОГО JSON:
{
  "documentGaps": ["конкретно чего НЕ ХВАТАЕТ в документе или что оформлено неверно, со ссылкой на требование", "..."],
  "strengthenedRecommendations": ["усиленные практические рекомендации: что именно дооформить/добавить", "..."]
}

Правила:
- Пиши КОНКРЕТНО: не «нужны обследования», а «в заключении нет угла свода стопы в градусах для обеих стоп — без него степень не засчитают».
- Для бронхиальной астмы: «БА» и «Астма» в графе диагноза считай указанием на бронхиальную астму. Формулировка «БА, дебют J45.0» = бронхиальная астма, дебют, МКБ-10 J45.0.
- J45.x в требованиях означает семейство кодов. Конкретные коды J45.0/J45.1/J45.8/J45.9 уже выполняют это требование; если такой код есть в тексте документа, НЕ указывай пробел «нет/нужно уточнить J45.x».
- Не переноси требования по полипозному синуситу/J33.x на аллергический ринит/J30.x или поллиноз. Если в тексте документа нет полипов, J33.x, синусита/риносинусита, КТ пазух или эндоскопического описания полипов, НЕ указывай пробелы про КТ придаточных пазух, ЛОР-заключение J33.x, сосудосуживающие капли, снижение обоняния или подтверждение полипозного синусита.
- Если в документе одновременно есть J45.x/БА и J30.x/аллергический ринит/поллиноз, ранжируй пробелы и рекомендации сначала по бронхиальной астме, затем по вторичным аллергологическим диагнозам.
- Если документ полностью соответствует требованиям — верни пустые массивы.
- Опирайся ТОЛЬКО на требования ниже, ничего не выдумывай.

=== ТЕКСТ ДОКУМЕНТА ===
${String(result.extractedText).slice(0, 4000)}

=== ЭКСПЕРТНЫЕ ТРЕБОВАНИЯ (база знаний) ===
${checklistText}`;

        const gapResp = await callAIWithRetry(
          "https://api.openai.com/v1/chat/completions",
          {
            method: "POST",
            headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: VISION_MODEL,
              messages: [{ role: "user", content: gapPrompt }],
              response_format: { type: "json_object" },
            }),
          },
          2,
        );

        if (gapResp.ok) {
          const gapData = await gapResp.json();
          const gapContent = gapData.choices?.[0]?.message?.content ?? "";
          const gapMatch = gapContent.match(/\{[\s\S]*\}/);
          const gaps = gapMatch ? JSON.parse(gapMatch[0]) : JSON.parse(gapContent);
          const sourceText = String(result.extractedText ?? "");
          const gapList: string[] = cleanIrrelevantDocumentAdvice(gaps.documentGaps, sourceText);
          const strong: string[] = cleanIrrelevantDocumentAdvice(gaps.strengthenedRecommendations, sourceText);
          const baseRecs = Array.isArray(result.recommendations) ? result.recommendations : [];
          if (gapList.length) {
            result.documentGaps = gapList;
            const tagged = gapList.map((g: string) => `⚠️ Чего не хватает в документе: ${g}`);
            result.recommendations = [...tagged, ...strong, ...baseRecs];
          } else if (strong.length) {
            result.recommendations = [...strong, ...baseRecs];
          }
          console.log("[analyze] RAG gaps:", gapList.length, "strengthened:", strong.length, "from", knowledge.length, "chunks");
        }
      }
    } catch (e) {
      console.error("[analyze] RAG enrich failed (continuing):", e instanceof Error ? e.message : e);
    }

    result = normalizeAsthmaAnalysisResult(result);

    // Находим ID типа документа по коду
    let documentTypeId = null;
    if (result.documentTypeCode && documentTypes) {
      const foundType = documentTypes.find((t) => t.code === result.documentTypeCode);
      documentTypeId = foundType?.id || null;
    }

    // Находим ID основной статьи (для обратной совместимости)
    let primaryArticleId = null;
    const primaryArticleNumber = result.primaryArticleNumber || result.linkedArticleNumber;
    if (primaryArticleNumber && articles) {
      const foundArticle = articles.find((a) => a.article_number === String(primaryArticleNumber));
      primaryArticleId = foundArticle?.id || null;
    }

    // ── Режим юриста: документ загружен юристом в карточку клиента
    //    (lawyer_client_med_docs). Пишем результат туда и выходим — client-путь
    //    (documentId + document_article_links) НЕ затрагиваем. Юрист может
    //    анализировать ТОЛЬКО свои документы (IDOR-защита по lawyer_id). ──
    if (lawyerDocId) {
      const { data: lawyerDoc } = await supabase
        .from("lawyer_client_med_docs")
        .select("lawyer_id")
        .eq("id", lawyerDocId)
        .single();

      if (!lawyerDoc || lawyerDoc.lawyer_id !== authData.user.id) {
        return new Response(
          JSON.stringify({ error: "Документ не найден или доступ запрещён" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const { error: lawyerUpdateError } = await supabase
        .from("lawyer_client_med_docs")
        .update({
          raw_text: result.extractedText,
          ai_fitness_category: result.fitnessCategory,
          ai_category_chance: result.categoryBChance || 0,
          ai_recommendations: result.recommendations || [],
          ai_explanation: result.explanation,
          updated_at: new Date().toISOString(),
        })
        .eq("id", lawyerDocId);

      if (lawyerUpdateError) {
        console.error("Failed to update lawyer_client_med_docs:", lawyerUpdateError);
        return new Response(
          JSON.stringify({ error: "Не удалось сохранить результат анализа документа" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Обновляем документ в базе данных если есть documentId
    if (documentId) {
      // Сначала получаем текущий документ чтобы проверить владельца и meta
      const { data: currentDoc } = await supabase
        .from("medical_documents_v2")
        .select("meta, title, user_id")
        .eq("id", documentId)
        .single();

      // ── IDOR-защита: документ должен принадлежать вызывающему пользователю ──
      // userId из тела запроса НЕ доверяем — сверяем владельца с user.id из токена.
      if (!currentDoc || currentDoc.user_id !== authData.user.id) {
        return new Response(
          JSON.stringify({ error: "Документ не найден или доступ запрещён" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const hasParts =
        currentDoc?.meta?.parts && Array.isArray(currentDoc.meta.parts) && currentDoc.meta.parts.length > 1;

      const updateData: Record<string, any> = {
        raw_text: result.extractedText,
        is_classified: true,
        ai_fitness_category: result.fitnessCategory,
        ai_category_chance: result.categoryBChance || 0,
        ai_recommendations: result.recommendations || [],
        ai_explanation: result.explanation,
        updated_at: new Date().toISOString(),
      };

      if (result.documentDate) {
        // Parse date from various formats (DD.MM.YYYY, DD/MM/YYYY, YYYY-MM-DD, etc.)
        let parsedDate: string | null = null;
        const dateStr = String(result.documentDate).trim();
        
        // Try DD.MM.YYYY or DD/MM/YYYY format
        const dmyMatch = dateStr.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})$/);
        if (dmyMatch) {
          const [, day, month, year] = dmyMatch;
          parsedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
        // Try YYYY-MM-DD format (already correct)
        else if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          parsedDate = dateStr;
        }
        
        if (parsedDate) {
          updateData.document_date = parsedDate;
        } else {
          console.warn("Could not parse document date:", dateStr);
        }
      }
      if (documentTypeId) {
        updateData.document_type_id = documentTypeId;

        // Если есть parts в meta, обновляем тип первой части
        if (currentDoc?.meta?.parts && Array.isArray(currentDoc.meta.parts)) {
          const foundType = documentTypes?.find((t) => t.id === documentTypeId);
          const updatedParts = [...currentDoc.meta.parts];
          if (updatedParts[0]) {
            updatedParts[0].type_id = documentTypeId;
            updatedParts[0].type_name = foundType?.name || null;
          }
          updateData.meta = { parts: updatedParts };
        }
      }
      if (primaryArticleId) {
        updateData.linked_article_id = primaryArticleId;
      }
      // Не перезаписываем title если документ объединён из нескольких частей
      if (result.suggestedTitle && !hasParts) {
        updateData.title = result.suggestedTitle;
      }

      const { error: updateError } = await supabase
        .from("medical_documents_v2")
        .update(updateData)
        .eq("id", documentId);

      if (updateError) {
        console.error("Failed to update document:", updateError);
      }

      // Удаляем старые связи и создаём новые в junction-таблице
      if (result.linkedArticles && Array.isArray(result.linkedArticles) && result.linkedArticles.length > 0) {
        // Сначала удаляем старые связи
        const { error: deleteError } = await supabase
          .from("document_article_links")
          .delete()
          .eq("document_id", documentId);

        if (deleteError) {
          console.error("Failed to delete old article links:", deleteError);
        }

        // Создаём новые связи для каждой статьи
        const linksToInsert = [];
        for (const articleLink of result.linkedArticles) {
          const articleNum = String(articleLink.articleNumber);
          const foundArticle = articles?.find((a) => a.article_number === articleNum);

          if (foundArticle) {
            linksToInsert.push({
              document_id: documentId,
              article_id: foundArticle.id,
              ai_fitness_category: articleLink.fitnessCategory,
              ai_category_chance: articleLink.categoryBChance || 0,
              ai_recommendations: articleLink.recommendations || [],
              ai_explanation: articleLink.explanation || `Диагноз: ${articleLink.diagnosisFound}`,
            });
          }
        }

        if (linksToInsert.length > 0) {
          const { error: insertError } = await supabase.from("document_article_links").insert(linksToInsert);

          if (insertError) {
            console.error("Failed to insert article links:", insertError);
          } else {
            console.log(`Successfully linked document to ${linksToInsert.length} articles`);
          }
        }
      } else if (primaryArticleId) {
        // Если нет массива linkedArticles, но есть основная статья - создаём одну связь
        const { error: deleteError } = await supabase
          .from("document_article_links")
          .delete()
          .eq("document_id", documentId);

        if (!deleteError) {
          const { error: insertError } = await supabase.from("document_article_links").insert({
            document_id: documentId,
            article_id: primaryArticleId,
            ai_fitness_category: result.fitnessCategory,
            ai_category_chance: result.categoryBChance || 0,
            ai_recommendations: result.recommendations || [],
            ai_explanation: result.explanation,
          });

          if (insertError) {
            console.error("Failed to insert single article link:", insertError);
          }
        }
      }
    }

    // Email-уведомление о завершении анализа — fail-open, не блокирует ответ
    // пользователю. Пересылаем токен ВЫЗЫВАЮЩЕГО пользователя (не сервисный) —
    // notify-analysis-complete сам достанет email из auth по этому токену.
    if (documentId) {
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/notify-analysis-complete`, {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            documentId,
            documentTitle: result.suggestedTitle || null,
            fitnessCategory: result.fitnessCategory,
            analysisResult: result.explanation,
          }),
        });
      } catch (notifyErr) {
        console.error("[analyze] notify-analysis-complete failed (non-blocking):", notifyErr);
      }
    }

    console.log("Medical document analysis completed successfully");

    return new Response(
      JSON.stringify({
        success: true,
        extractedText: result.extractedText,
        documentDate: result.documentDate,
        documentTypeCode: result.documentTypeCode,
        linkedArticles: result.linkedArticles || [],
        primaryArticleNumber: primaryArticleNumber,
        fitnessCategory: result.fitnessCategory,
        categoryBChance: result.categoryBChance || 0,
        explanation: result.explanation,
        recommendations: result.recommendations || [],
        documentGaps: result.documentGaps || [],
        suggestedTitle: result.suggestedTitle,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in analyze-medical-document:", error);
    return new Response(
      JSON.stringify({
        error: "processing_error",
        message: error instanceof Error ? error.message : "Произошла ошибка при анализе документа",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
