// Shared compact answer policy loaded from the canonical SecondBrain.
// A short fallback keeps every consumer consistent during an index outage.

// deno-lint-ignore no-explicit-any
type Sb = any;

const CACHE_TTL_MS = 5 * 60 * 1000;
const POLICY_CAP = 6000;

let cachedPolicy: { value: string; expiresAt: number } | null = null;

export const FALLBACK_ANSWER_POLICY = [
  "Сначала дай конкретный вывод, затем подтвержденные факты, пробелы и действия.",
  "Не пересказывай вопрос, не добавляй общие определения и не повторяй один вывод.",
  "При нескольких диагнозах главным считай наиболее подтвержденное непризывное основание.",
  "Не переноси требования соседней статьи или другого заболевания.",
  "Не называй отсутствующим то, что уже указано допустимым сокращением или конкретным кодом.",
  "Не требуй от врача категорию годности, статью РБ или решение ВВК.",
  "Объединяй одинаковые обследования и консультации; сначала обязательное, затем усиливающее.",
  "Числа, пороги и статьи бери только из найденного экспертного контекста.",
].join("\n- ");

export async function getRagAnswerPolicy(sb: Sb): Promise<string> {
  const now = Date.now();
  if (cachedPolicy && cachedPolicy.expiresAt > now) {
    return cachedPolicy.value;
  }

  try {
    const { data, error } = await sb
      .from("rag_system_context")
      .select("content")
      .eq("name", "политика_ответов")
      .maybeSingle();
    if (error) throw error;
    const content = String(data?.content ?? "").trim();
    const value = content
      ? content.slice(0, POLICY_CAP)
      : FALLBACK_ANSWER_POLICY;
    cachedPolicy = { value, expiresAt: now + CACHE_TTL_MS };
    return value;
  } catch (error) {
    console.error(
      "[ragPolicy] load failed:",
      error instanceof Error ? error.message : error,
    );
    return FALLBACK_ANSWER_POLICY;
  }
}
