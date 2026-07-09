import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  renderChunks,
  searchMedicalRequirements,
} from "../_shared/ragSearch.ts";
import { MODEL_VISION } from "../_shared/llmGateway.ts";
import { dedupeAdvice } from "../_shared/medicalAdvice.ts";
import { getRagAnswerPolicy } from "../_shared/ragPolicy.ts";

const getAllowedOrigin = (req?: Request) => {
  const requestOrigin = req?.headers.get("origin") || "";
  const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN") || "";
  if (allowedOrigin && requestOrigin === allowedOrigin) return requestOrigin;
  if (
    requestOrigin === "https://nepriziv.ru" ||
    requestOrigin === "https://www.nepriziv.ru"
  ) return requestOrigin;
  if (requestOrigin.endsWith(".lovable.app")) return requestOrigin;
  if (requestOrigin.startsWith("http://localhost")) return requestOrigin;
  return allowedOrigin || "*";
};

const getCorsHeaders = (req?: Request) => ({
  "Access-Control-Allow-Origin": getAllowedOrigin(req),
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
});

// Retry helper with exponential backoff for image processing errors
async function callAIWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = 3,
): Promise<Response> {
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
      console.error(
        `AI API error (attempt ${attempt}):`,
        response.status,
        errorText,
      );

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
        console.log(
          `Request failed, retrying in ${delayMs}ms...`,
          lastError.message,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError || new Error("All retry attempts failed");
}

const ASTHMA_ICD_RE = /\bJ\s*45(?:\s*[\.,]\s*\d)?\b/i;
const CONCRETE_ASTHMA_ICD_RE = /\bJ\s*45\s*[\.,]\s*\d\b/i;
const ASTHMA_ABBREVIATION_RE =
  /(?:^|[^А-Яа-яЁёA-Za-z])БА(?:$|[^А-Яа-яЁёA-Za-z])/u;
const ASTHMA_WORD_RE =
  /бронхиальн[а-яё]*\s+астм[а-яё]*|(?:^|[^А-Яа-яЁёA-Za-z])астм[а-яё]*/iu;
const ASTHMA_DEBUT_RE = /дебют|впервые\s+выявлен/iu;
const ASTHMA_OBJECTIVE_SUPPORT_RE =
  /госпитализац|стационар|скор(?:ая|ой)|\bФВД\b|спирометр|ОФВ\s*1|бронхолитическ[а-яё]*\s+проб|проб[а-яё]*\s+с\s+бронхолит|пик[-\s]?флоу|метахолин|диспансерн|льготн[а-яё]*\s+(?:категор|рецепт)/iu;
const ALLERGIC_RHINITIS_RE =
  /\bJ\s*30(?:\s*[\.,]\s*\d)?\b|аллергическ[а-яё]*\s+ринит|поллиноз|сенсибилизац/iu;
const POLYPOSIS_SINUS_SOURCE_RE =
  /\bJ\s*33(?:\s*[\.,]\s*\d)?\b|полип|синусит|гайморит|риносинусит|пансинусит|пазух|сосудосужива|обонян/iu;
const POLYPOSIS_SINUS_ADVICE_RE =
  /полип|j\s*33|синусит|гайморит|риносинусит|кт\s+.*пазух|пазух.*кт|околоносов|придаточн[а-яё]*\s+пазух|лор[-\s]?врач|эндоскопическ[а-яё]*\s+исследован[а-яё]*\s+полости\s+носа|сосудосужива|обонян/iu;
const CHILDHOOD_TRANSFER_SOURCE_RE =
  /детск[а-яё]*\s+(?:поликлиник|карт|выписк|больниц)|с\s+детств|до\s*18|в\s*18\s+лет|переход[а-яё\s]+во\s+взросл|из\s+детск[а-яё]+\s+во\s+взросл/iu;
const CHILDHOOD_TRANSFER_ADVICE_RE =
  /перенос[а-яё\s]+диагноз|перенести\s+диагноз|детск[а-яё]*\s+(?:поликлиник|карт|выписк)|во\s+взросл[а-яё]*\s+(?:поликлиник|карт)|из\s+детск[а-яё]+\s+во\s+взросл/iu;
const MILITARY_FITNESS_DOCUMENT_ADVICE_RE =
  /инвалидизац|военн[а-яё\s-]*годност|призывн[а-яё\s-]*годност|категори[яи]\s+призывн[а-яё]*\s+годност|граф[аеуы]?\s*(?:i|1)\b|рекомендац[а-яё]*\s+по\s+военн[а-яё]*\s+годност|отсыл[а-яё]*\s+к\s+расписани[юя]\s+болезн/iu;

const normalizeText = (value: unknown): string =>
  String(value ?? "").replace(/\s+/g, " ").trim();

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
  ASTHMA_ICD_RE.test(text) || ASTHMA_ABBREVIATION_RE.test(text) ||
  ASTHMA_WORD_RE.test(text);

const hasAllergicRhinitisWithoutPolypSinusEvidence = (text: string): boolean =>
  ALLERGIC_RHINITIS_RE.test(text) && !POLYPOSIS_SINUS_SOURCE_RE.test(text);

const isFalseAsthmaIcdGap = (message: string, sourceText: string): boolean => {
  if (!CONCRETE_ASTHMA_ICD_RE.test(sourceText)) return false;

  const msg = normalizeText(message).toLowerCase();
  const complainsAboutCode =
    /(?:нет|отсутств|не указан[ао]?|не хватает)\s+(?:кода?\s*)?(?:мкб|j\s*45|код)/i
      .test(msg) ||
    /(?:уточнить|добавить|указать)\s+(?:код\s*)?(?:мкб|j\s*45|код)/i.test(
      msg,
    ) ||
    /j\s*45\s*(?:[\.,]\s*)?[xх]\b/i.test(msg);
  const mentionsAsthma = /астм|бронхиальн|j\s*45/i.test(msg);

  return complainsAboutCode && mentionsAsthma;
};

const isIrrelevantPolypSinusAdvice = (
  message: string,
  sourceText: string,
): boolean => {
  if (!ALLERGIC_RHINITIS_RE.test(sourceText)) return false;
  if (POLYPOSIS_SINUS_SOURCE_RE.test(sourceText)) return false;
  return POLYPOSIS_SINUS_ADVICE_RE.test(message);
};

const isIrrelevantChildhoodTransferAdvice = (
  message: string,
  sourceText: string,
): boolean => {
  if (CHILDHOOD_TRANSFER_SOURCE_RE.test(sourceText)) return false;
  return CHILDHOOD_TRANSFER_ADVICE_RE.test(message);
};

const isInvalidMilitaryFitnessDocumentAdvice = (message: string): boolean =>
  MILITARY_FITNESS_DOCUMENT_ADVICE_RE.test(message);

const cleanIrrelevantDocumentAdvice = (
  items: unknown,
  sourceText: string,
): string[] => {
  if (!Array.isArray(items)) return [];
  const filtered = items
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .filter((item) => !isFalseAsthmaIcdGap(item, sourceText))
    .filter((item) => !isIrrelevantPolypSinusAdvice(item, sourceText))
    .filter((item) => !isIrrelevantChildhoodTransferAdvice(item, sourceText))
    .filter((item) => !isInvalidMilitaryFitnessDocumentAdvice(item));
  return dedupeAdvice(filtered);
};

const normalizeAnalysisAdvice = (
  result: Record<string, any>,
): Record<string, any> => {
  const sourceText = normalizeText(result.extractedText);
  result.documentGaps = cleanIrrelevantDocumentAdvice(
    result.documentGaps,
    sourceText,
  ).slice(0, 6);
  result.recommendations = cleanIrrelevantDocumentAdvice(
    result.recommendations,
    sourceText,
  ).slice(0, 10);
  if (Array.isArray(result.linkedArticles)) {
    const merged = new Map<string, Record<string, any>>();
    const order: string[] = [];
    for (const article of result.linkedArticles) {
      article.recommendations = cleanIrrelevantDocumentAdvice(
        article?.recommendations,
        sourceText,
      ).slice(0, 6);
      const articleNumber = normalizeArticleNumber(article?.articleNumber);
      if (!articleNumber) continue;
      const existing = merged.get(articleNumber);
      if (!existing) {
        merged.set(articleNumber, article);
        order.push(articleNumber);
        continue;
      }
      const diagnoses = [
        normalizeText(existing.diagnosisFound),
        normalizeText(article.diagnosisFound),
      ].filter(Boolean);
      existing.diagnosisFound = [...new Set(diagnoses)].join("; ");
      existing.recommendations = dedupeAdvice([
        ...(existing.recommendations ?? []),
        ...(article.recommendations ?? []),
      ]);
      if (
        numericChance(article.categoryBChance) >
          numericChance(existing.categoryBChance)
      ) {
        existing.categoryBChance = article.categoryBChance;
        existing.fitnessCategory = article.fitnessCategory;
        existing.explanation = article.explanation;
      }
    }
    result.linkedArticles = order.map((articleNumber) =>
      merged.get(articleNumber)
    );
  }
  return result;
};

const applyArticleCorrections = (
  result: Record<string, any>,
  corrections: unknown,
  validArticleNumbers: Set<string>,
): void => {
  if (!Array.isArray(corrections) || !Array.isArray(result.linkedArticles)) {
    return;
  }
  const validCategories = new Set(["А", "Б", "В", "Г", "Д"]);

  for (const raw of corrections.slice(0, 8)) {
    if (!raw || typeof raw !== "object") continue;
    const correction = raw as Record<string, unknown>;
    const nextArticle = normalizeArticleNumber(correction.articleNumber);
    if (!nextArticle || !validArticleNumbers.has(nextArticle)) continue;

    const fromArticle = normalizeArticleNumber(correction.fromArticleNumber);
    const diagnosis = normalizeText(correction.diagnosisFound).toLowerCase();
    const diagnosisTokens = diagnosis
      .split(/[^а-яёa-z0-9]+/iu)
      .filter((token) => token.length >= 4);
    if (!fromArticle && !diagnosisTokens.length) continue;

    const target = result.linkedArticles.find(
      (article: Record<string, any>) => {
        const articleNumber = normalizeArticleNumber(article?.articleNumber);
        if (fromArticle && articleNumber !== fromArticle) return false;
        if (!diagnosisTokens.length) return true;
        const existing = normalizeText(article?.diagnosisFound).toLowerCase();
        return diagnosisTokens.some((token) => existing.includes(token));
      },
    );
    if (!target) continue;

    target.articleNumber = nextArticle;
    const category = normalizeText(correction.fitnessCategory).toUpperCase();
    if (validCategories.has(category)) {
      target.fitnessCategory = category;
    }
    if (
      correction.categoryBChance !== undefined &&
      correction.categoryBChance !== null
    ) {
      const chance = Math.max(
        0,
        Math.min(100, numericChance(correction.categoryBChance)),
      );
      target.categoryBChance = chance;
    }
    const explanation = normalizeText(correction.explanation);
    if (explanation) {
      target.explanation = explanation;
    }
  }
};

const recalculatePrimaryArticle = (result: Record<string, any>): void => {
  if (!Array.isArray(result.linkedArticles) || !result.linkedArticles.length) {
    return;
  }
  const primary = result.linkedArticles.reduce(
    (best: Record<string, any>, article: Record<string, any>) =>
      numericChance(article?.categoryBChance) >
          numericChance(best?.categoryBChance)
        ? article
        : best,
    result.linkedArticles[0],
  );
  result.primaryArticleNumber = normalizeArticleNumber(primary.articleNumber);
  result.categoryBChance = numericChance(primary.categoryBChance);
  if (primary.fitnessCategory) result.fitnessCategory = primary.fitnessCategory;
};

const normalizeAsthmaAnalysisResult = (
  result: Record<string, any>,
): Record<string, any> => {
  const extractedText = normalizeText(result.extractedText);
  if (!extractedText || !hasAsthmaEvidence(extractedText)) {
    return result;
  }

  const asthmaCode = extractAsthmaIcdCode(extractedText);
  const hasDebut = ASTHMA_DEBUT_RE.test(extractedText);
  const hasObjectiveSupport = ASTHMA_OBJECTIVE_SUPPORT_RE.test(extractedText);
  const normalizedDiagnosis = `Бронхиальная астма${hasDebut ? ", дебют" : ""}${
    asthmaCode ? ` (${asthmaCode})` : ""
  }`;
  const asthmaChance = hasDebut ? (hasObjectiveSupport ? 65 : 60) : 80;
  const asthmaMaxChance = hasDebut ? 65 : 100;
  const asthmaCategory = hasDebut ? "Г" : "В";

  if (!Array.isArray(result.linkedArticles)) {
    result.linkedArticles = [];
  }

  const linkedArticles = result.linkedArticles as Array<Record<string, any>>;
  const hasSecondaryRhinitisOnly = hasAllergicRhinitisWithoutPolypSinusEvidence(
    extractedText,
  );
  for (const article of linkedArticles) {
    article.recommendations = cleanIrrelevantDocumentAdvice(
      article?.recommendations,
      extractedText,
    );
    if (
      hasSecondaryRhinitisOnly &&
      normalizeArticleNumber(article?.articleNumber) === "49"
    ) {
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
    return articleNumber === "52" || ASTHMA_ICD_RE.test(diagnosis) ||
      ASTHMA_WORD_RE.test(diagnosis);
  });

  const asthmaExplanation =
    `В тексте документа есть формулировка "${
      ASTHMA_ABBREVIATION_RE.test(extractedText) ? "БА" : "астма"
    }"` +
    `${
      asthmaCode ? ` и код МКБ-10 ${asthmaCode}` : ""
    }: это относится к бронхиальной астме по статье 52 Расписания болезней.` +
    (hasDebut
      ? " Пометка «дебют» означает впервые выявленное заболевание, а не отсутствие диагноза; без истории наблюдения, госпитализаций или объективных ФВД это предварительно даёт умеренный шанс категории В, примерно 55-65%."
      : "");

  if (existingAsthma) {
    existingAsthma.articleNumber = "52";
    existingAsthma.diagnosisFound =
      normalizeText(existingAsthma.diagnosisFound) || normalizedDiagnosis;
    if (!/бронхиальн|астм|j\s*45/i.test(existingAsthma.diagnosisFound)) {
      existingAsthma.diagnosisFound = normalizedDiagnosis;
    } else if (
      asthmaCode &&
      !new RegExp(asthmaCode.replace(".", "\\."), "i").test(
        existingAsthma.diagnosisFound,
      )
    ) {
      existingAsthma.diagnosisFound =
        `${existingAsthma.diagnosisFound} (${asthmaCode})`;
    }
    if (
      !existingAsthma.explanation ||
      isFalseAsthmaIcdGap(existingAsthma.explanation, extractedText)
    ) {
      existingAsthma.explanation = asthmaExplanation;
    }
    if (typeof existingAsthma.categoryBChance !== "number") {
      existingAsthma.categoryBChance = asthmaChance;
    } else if (existingAsthma.categoryBChance < asthmaChance) {
      existingAsthma.categoryBChance = asthmaChance;
    } else if (existingAsthma.categoryBChance > asthmaMaxChance) {
      existingAsthma.categoryBChance = asthmaMaxChance;
    }
    if (
      !existingAsthma.fitnessCategory ||
      !["В", "Д"].includes(String(existingAsthma.fitnessCategory))
    ) {
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

  if (
    hasDebut && normalizeArticleNumber(result.primaryArticleNumber) === "52" &&
    currentChance > asthmaMaxChance
  ) {
    result.categoryBChance = asthmaMaxChance;
    if (!["В", "Д"].includes(String(result.fitnessCategory))) {
      result.fitnessCategory = asthmaCategory;
    }
  }

  const highestArticle = linkedArticles.reduce<Record<string, any> | null>(
    (best, article) => {
      return !best ||
          numericChance(article?.categoryBChance) >
            numericChance(best?.categoryBChance)
        ? article
        : best;
    },
    null,
  );
  if (highestArticle) {
    const highestChance = numericChance(highestArticle.categoryBChance);
    const hasAsthmaArticle = linkedArticles.some((article) =>
      normalizeArticleNumber(article?.articleNumber) === "52"
    );
    const asthmaWasOnlyHighSource = hasDebut &&
      hasAsthmaArticle &&
      currentChance > highestChance &&
      linkedArticles.every((article) => {
        return normalizeArticleNumber(article?.articleNumber) === "52" ||
          numericChance(article?.categoryBChance) <= asthmaMaxChance;
      });

    if (currentChance < highestChance || asthmaWasOnlyHighSource) {
      result.primaryArticleNumber =
        normalizeArticleNumber(highestArticle.articleNumber) ||
        result.primaryArticleNumber;
      result.categoryBChance = highestChance;
      if (highestArticle.fitnessCategory) {
        result.fitnessCategory = highestArticle.fitnessCategory;
      }
    }
  }

  const explanation = normalizeText(result.explanation);
  if (explanation && !/бронхиальн|астм|j\s*45/i.test(explanation)) {
    result.explanation =
      `${explanation} Также в документе учтено: ${asthmaExplanation}`;
  }

  result.documentGaps = cleanIrrelevantDocumentAdvice(
    result.documentGaps,
    extractedText,
  );
  result.recommendations = cleanIrrelevantDocumentAdvice(
    result.recommendations,
    extractedText,
  );

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
      return new Response(
        JSON.stringify({ error: "Требуется аутентификация" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY",
    )!;
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    // Vision-модель OpenAI (читает фото/скан документа). Переключаемо секретом.
    const VISION_MODEL = MODEL_VISION;

    // Verify user token
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData, error: authError } = await authClient.auth
      .getUser();
    if (authError || !authData?.user) {
      return new Response(
        JSON.stringify({ error: "Неверный токен авторизации" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const {
      imageBase64,
      images,
      documentId,
      userId,
      manualText,
      isHandwritten,
      lawyerDocId,
    } = await req.json();

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

    const documentTypesStr = documentTypes?.map((t) =>
      `${t.code}: ${t.name}`
    ).join(", ") || "";
    const articlesStr = articles?.map((a) =>
      `Статья ${a.article_number}: ${a.title}`
    ).join("\n") || "";

    // Базовый промпт с правилами
    const basePrompt =
      `Ты — медицинский эксперт-документовед по военно-врачебной экспертизе РФ. Это первый проход: точно распознай документ, выдели медицинские факты и дай только предварительную классификацию. Окончательная сверка статей и требований выполняется отдельным проходом по экспертной базе.

ОБЯЗАТЕЛЬНЫЕ ПРАВИЛА:
- Извлекай формулировки, даты, коды МКБ, числовые значения, единицы измерения и назначения без домысливания.
- Разделяй установленный диагноз, подозрение, жалобу и рекомендацию врача. Не превращай жалобу в диагноз.
- Раскрывай общепринятые медицинские сокращения по контексту. «БА» или «Астма» в графе диагноза означает бронхиальную астму; «БА, дебют J45.0» — бронхиальная астма, дебют, МКБ-10 J45.0.
- Конкретный код J45.0/J45.1/J45.8/J45.9 уже относится к семейству J45.x; не объявляй код отсутствующим.
- Не переноси требования одного заболевания на другое из-за соседней статьи или общей главы. Аллергический ринит J30.x не равен полипозному синуситу J33.x.
- Найди все явно указанные диагнозы, но главным сделай основание с наиболее сильной подтверждённой перспективой. Вторичные диагнозы не должны вытеснять главное.
- Статью и категорию на первом проходе указывай предварительно только при уверенном соответствии названию статьи из переданного списка. При сомнении снижай уверенность, а не придумывай.
- Сравнивай даты и объективные обследования, но более свежий результат не отменяет подтверждённый анамнез автоматически.
- Для дебюта заболевания, единственного частного заключения и отсутствия объективной функциональной проверки снижай шанс, не отрицая сам документированный диагноз.
- Не требуй от лечащего врача категорию годности, графу Расписания болезней, решение ВВК или формулировку о военной годности.
- Рекомендации: только обследования и специалисты, непосредственно нужные для найденного диагноза; максимум 6 приоритетных пунктов, без лечения, дублей и действий «на всякий случай».`;
    let prompt: string;
    let requestBody: any;

    if (isHandwritten && manualText) {
      // Анализ рукописного документа на основе текста, введённого пользователем
      console.log(
        "Starting handwritten document analysis based on user-entered text",
      );

      // Check if this is a questionnaire (longer text with multiple sections)
      const isQuestionnaire = manualText.length > 500;

      const examinationsList = `ПРАВИЛА РЕКОМЕНДАЦИЙ:
- Не выбирай обследования из универсального каталога.
- Для установленного диагноза рекомендуй только критерии подтверждения именно этого диагноза.
- Для жалобы без диагноза укажи минимальный следующий шаг, который проверяет наиболее вероятное основание.
- Не повторяй уже выполненное обследование, если документ содержит достаточный результат; повтор предлагай только из-за конкретной неполноты, противоречия или необходимости динамики.
- Максимум 6 приоритетных рекомендаций на весь документ; одинаковые консультации и исследования объединяй.`;

      prompt = `${basePrompt}

ЗАДАЧА: Проанализируй информацию, введённую пользователем из ${
        isQuestionnaire
          ? "медицинского опросника призывника"
          : "рукописного медицинского документа"
      }:

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
1. Не рекомендуй лечение, препараты или курсы терапии.
2. На весь документ верни не более 6 обследований/консультаций, непосредственно связанных с найденными диагнозами.
3. Жалоба без установленного диагноза относится в diagnosticReasoning; не создавай по ней уверенную статью или категорию.
4. Не повторяй уже выполненное исследование без конкретной причины обновления или устранения неполноты.

На основе текста выполни следующее:

1. ОПРЕДЕЛЕНИЕ ТИПА ДОКУМЕНТА:
   Выбери наиболее подходящий тип из списка:
   ${documentTypesStr}
   Если не подходит ни один — выбери other или unknown.

2. ПРЕДВАРИТЕЛЬНАЯ СВЯЗЬ С РАСПИСАНИЕМ БОЛЕЗНЕЙ:
   Используй только названия статей из списка:
   ${articlesStr}
   Для каждого установленного диагноза укажи наиболее вероятную статью. Для жалобы или подозрения без диагноза статью не выдумывай.

3. КАТЕГОРИЯ И ШАНС:
   Дай предварительную категорию и шанс только по данным текста. Не применяй универсальное правило «хроническое заболевание = В».
   При неполном подтверждении снижай шанс и кратко объясняй недостающий квалифицирующий факт.

4. РЕКОМЕНДАЦИИ:
   Только минимальные следующие действия для подтверждения найденных оснований, без дублей и лечения.

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
  "recommendations": ["до 6 приоритетных действий по подтверждённым или обоснованно предполагаемым диагнозам, без дублей"],
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
      console.log(
        "Starting comprehensive medical document analysis with OpenAI",
      );

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

4. ПРЕДВАРИТЕЛЬНАЯ СВЯЗЬ С РАСПИСАНИЕМ БОЛЕЗНЕЙ:
   Для каждого явно установленного диагноза выбери наиболее вероятную статью только из списка:
   ${articlesStr}
   Не подбирай статью по одному исследованию или жалобе без диагноза. Если соответствие неоднозначно, отрази низкую уверенность в explanation.

5. КАТЕГОРИЯ ГОДНОСТИ:
   Категория предварительная. Определи её по установленному диагнозу, степени/стадии, нарушению функции и объективным данным документа.
   Не применяй универсальное правило «хроническое заболевание или II степень = категория В».

6. ШАНС КАТЕГОРИИ В:
   Оцени силу именно этого документа: полноту диагноза, объективные критерии, источник, даты и непротиворечивость.
   При единственном заключении, дебюте, подозрении или отсутствии квалифицирующего показателя снижай шанс и объясняй причину.

7. РЕКОМЕНДАЦИИ:
   Не более 6 приоритетных действий на весь документ. Только специалисты, обследования или документы, непосредственно необходимые для найденных оснований; без лечения, дублей и действий «на всякий случай».

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
      const rawImages: string[] =
        (Array.isArray(images) && images.length ? images : [imageBase64])
          .filter((x: unknown): x is string =>
            typeof x === "string" && x.length > 0
          )
          .slice(0, 6); // ограничиваем стоимость/размер запроса к ИИ

      const cleanImages = rawImages
        .map((img: string) =>
          (img.includes("base64,") ? img.split("base64,")[1] : img).replace(
            /\s/g,
            "",
          )
        )
        .filter((b: string) =>
          b && b.length >= 100
        );

      if (cleanImages.length === 0) {
        throw new Error(
          "Invalid image data: base64 string is too short or empty",
        );
      }

      // Проверяем валидность base64 на первой странице
      try {
        atob(cleanImages[0].substring(0, 100));
      } catch (e) {
        console.error("Invalid base64 encoding");
        throw new Error("Invalid base64 image data");
      }
      console.log(
        "Images for analysis:",
        cleanImages.length,
        "first length:",
        cleanImages[0].length,
      );

      // При нескольких страницах просим ИИ анализировать их как единый документ.
      const promptForPages = cleanImages.length > 1
        ? prompt +
          "\n\nВНИМАНИЕ: ниже НЕСКОЛЬКО страниц ОДНОГО медицинского документа. Проанализируй их ВМЕСТЕ как единый документ, объединяя диагнозы и данные со всех страниц."
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
      const errorMessage = retryError instanceof Error
        ? retryError.message
        : String(retryError);
      if (
        errorMessage.includes("image") ||
        errorMessage.includes("Unable to process")
      ) {
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
          message:
            "Не удалось разобрать ответ ИИ. Попробуйте повторить анализ.",
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
          if (a?.articleNumber != null) {
            articleNums.push(String(a.articleNumber));
          }
        }
      }
      if (result.primaryArticleNumber) {
        articleNums.push(String(result.primaryArticleNumber));
      }

      const sourceText = String(result.extractedText ?? "");
      const retrievalQuery =
        "Найди требования именно для диагнозов и обследований из медицинского документа:\n" +
        sourceText.slice(0, 6000);
      const knowledge = await searchMedicalRequirements(
        supabase,
        retrievalQuery,
        articleNums,
        { keep: 8 },
      );
      if (knowledge.length && result.extractedText) {
        const checklistText = renderChunks(knowledge, 1200);
        const answerPolicy = await getRagAnswerPolicy(supabase);
        const gapPrompt =
          `Ты — эксперт по военно-врачебной экспертизе. Ниже ТЕКСТ медицинского документа призывника и ЭКСПЕРТНЫЕ ТРЕБОВАНИЯ к оформлению документов по соответствующим статьям Расписания болезней (из базы знаний юриста).

Сверь документ с требованиями и верни СТРОГО JSON:
{
  "documentGaps": ["только обязательный дефект документа для этого диагноза и статьи", "..."],
  "strengthenedRecommendations": ["необязательное, но полезное усиление доказательств", "..."],
  "articleCorrections": [
    {
      "diagnosisFound": "диагноз из предварительного анализа",
      "fromArticleNumber": "предварительная статья",
      "articleNumber": "исправленная статья",
      "fitnessCategory": "А, Б, В, Г или Д",
      "categoryBChance": 0,
      "explanation": "почему требуется исправление со ссылкой на экспертный фрагмент"
    }
  ]
}

Правила:
- Сначала примени единую политику качества и краткости:
${answerPolicy}
- Не смешивай обязательный дефект документа с желательным усилением доказательств.
- Не повторяй один пункт в documentGaps и strengthenedRecommendations.
- articleCorrections заполняй ТОЛЬКО когда предварительная статья, категория или шанс явно противоречат найденному экспертному контексту. Иначе верни пустой массив.
- Не добавляй новый диагноз: исправляй только диагноз из предварительного анализа, который действительно указан в документе.
- Пиши КОНКРЕТНО: не «нужны обследования», а «в заключении нет угла свода стопы в градусах для обеих стоп — без него степень не засчитают».
- Для бронхиальной астмы: «БА» и «Астма» в графе диагноза считай указанием на бронхиальную астму. Формулировка «БА, дебют J45.0» = бронхиальная астма, дебют, МКБ-10 J45.0.
- J45.x в требованиях означает семейство кодов. Конкретные коды J45.0/J45.1/J45.8/J45.9 уже выполняют это требование; если такой код есть в тексте документа, НЕ указывай пробел «нет/нужно уточнить J45.x».
- Не переноси требования по полипозному синуситу/J33.x на аллергический ринит/J30.x или поллиноз. Если в тексте документа нет полипов, J33.x, синусита/риносинусита, КТ пазух или эндоскопического описания полипов, НЕ указывай пробелы про КТ придаточных пазух, ЛОР-заключение J33.x, сосудосуживающие капли, снижение обоняния или подтверждение полипозного синусита.
- Если в документе одновременно есть J45.x/БА и J30.x/аллергический ринит/поллиноз, ранжируй пробелы и рекомендации сначала по бронхиальной астме, затем по вторичным аллергологическим диагнозам.
- Не требуй, чтобы лечащий врач добавлял в медицинское заключение категорию годности, графу I, "военную/призывную годность", "военную инвалидизацию" или ссылку на Расписание болезней. Это не медицинский дефект документа.
- Не применяй правило о переносе диагноза из детской карты во взрослую, если в тексте документа нет детского анамнеза, детской поликлиники, перехода в 18 лет или старых детских записей.
- Если документ полностью соответствует требованиям — верни пустые массивы.
- Опирайся ТОЛЬКО на требования ниже, ничего не выдумывай.

=== ТЕКСТ ДОКУМЕНТА ===
${String(result.extractedText).slice(0, 4000)}

=== ПРЕДВАРИТЕЛЬНЫЕ СТАТЬИ ПЕРВОГО ПРОХОДА ===
${JSON.stringify(result.linkedArticles ?? [])}

=== ЭКСПЕРТНЫЕ ТРЕБОВАНИЯ (база знаний) ===
${checklistText}`;

        const gapResp = await callAIWithRetry(
          "https://api.openai.com/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${OPENAI_API_KEY}`,
              "Content-Type": "application/json",
            },
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
          const gaps = gapMatch
            ? JSON.parse(gapMatch[0])
            : JSON.parse(gapContent);
          const validArticleNumbers = new Set(
            (articles ?? []).map((article) => String(article.article_number)),
          );
          applyArticleCorrections(
            result,
            gaps.articleCorrections,
            validArticleNumbers,
          );
          recalculatePrimaryArticle(result);
          const gapList: string[] = cleanIrrelevantDocumentAdvice(
            gaps.documentGaps,
            sourceText,
          );
          const strong: string[] = cleanIrrelevantDocumentAdvice(
            gaps.strengthenedRecommendations,
            sourceText,
          );
          const baseRecs = Array.isArray(result.recommendations)
            ? result.recommendations
            : [];
          if (gapList.length) {
            result.documentGaps = gapList;
            const tagged = gapList.map((g: string) =>
              `⚠️ Чего не хватает в документе: ${g}`
            );
            result.recommendations = [...tagged, ...strong, ...baseRecs];
          } else if (strong.length) {
            result.recommendations = [...strong, ...baseRecs];
          }
          console.log(
            "[analyze] RAG gaps:",
            gapList.length,
            "strengthened:",
            strong.length,
            "from",
            knowledge.length,
            "chunks",
          );
        }
      }
    } catch (e) {
      console.error(
        "[analyze] RAG enrich failed (continuing):",
        e instanceof Error ? e.message : e,
      );
    }

    result = normalizeAnalysisAdvice(normalizeAsthmaAnalysisResult(result));
    recalculatePrimaryArticle(result);

    // Находим ID типа документа по коду
    let documentTypeId = null;
    if (result.documentTypeCode && documentTypes) {
      const foundType = documentTypes.find((t) =>
        t.code === result.documentTypeCode
      );
      documentTypeId = foundType?.id || null;
    }

    // Находим ID основной статьи (для обратной совместимости)
    let primaryArticleId = null;
    const primaryArticleNumber = result.primaryArticleNumber ||
      result.linkedArticleNumber;
    if (primaryArticleNumber && articles) {
      const foundArticle = articles.find((a) =>
        a.article_number === String(primaryArticleNumber)
      );
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
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
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
        console.error(
          "Failed to update lawyer_client_med_docs:",
          lawyerUpdateError,
        );
        return new Response(
          JSON.stringify({
            error: "Не удалось сохранить результат анализа документа",
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
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
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const hasParts = currentDoc?.meta?.parts &&
        Array.isArray(currentDoc.meta.parts) &&
        currentDoc.meta.parts.length > 1;

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
          parsedDate = `${year}-${month.padStart(2, "0")}-${
            day.padStart(2, "0")
          }`;
        } // Try YYYY-MM-DD format (already correct)
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
      if (
        result.linkedArticles && Array.isArray(result.linkedArticles) &&
        result.linkedArticles.length > 0
      ) {
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
          const foundArticle = articles?.find((a) =>
            a.article_number === articleNum
          );

          if (foundArticle) {
            linksToInsert.push({
              document_id: documentId,
              article_id: foundArticle.id,
              ai_fitness_category: articleLink.fitnessCategory,
              ai_category_chance: articleLink.categoryBChance || 0,
              ai_recommendations: articleLink.recommendations || [],
              ai_explanation: articleLink.explanation ||
                `Диагноз: ${articleLink.diagnosisFound}`,
            });
          }
        }

        if (linksToInsert.length > 0) {
          const { error: insertError } = await supabase.from(
            "document_article_links",
          ).insert(linksToInsert);

          if (insertError) {
            console.error("Failed to insert article links:", insertError);
          } else {
            console.log(
              `Successfully linked document to ${linksToInsert.length} articles`,
            );
          }
        }
      } else if (primaryArticleId) {
        // Если нет массива linkedArticles, но есть основная статья - создаём одну связь
        const { error: deleteError } = await supabase
          .from("document_article_links")
          .delete()
          .eq("document_id", documentId);

        if (!deleteError) {
          const { error: insertError } = await supabase.from(
            "document_article_links",
          ).insert({
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
        console.error(
          "[analyze] notify-analysis-complete failed (non-blocking):",
          notifyErr,
        );
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
        message: error instanceof Error
          ? error.message
          : "Произошла ошибка при анализе документа",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
