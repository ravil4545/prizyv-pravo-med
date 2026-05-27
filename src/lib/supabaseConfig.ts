// Дублирование констант из src/integrations/supabase/client.ts.
// client.ts auto-generated и не должен редактироваться (см. CLAUDE.md),
// но нам нужны URL и anon-key для прямого fetch к edge-функциям
// (где SSE-стриминг требует ReadableStream, а supabase.functions.invoke
// в браузере буферизирует ответ).
//
// Anon-key публичный — он отправляется в каждом запросе с фронта.
// При смене проекта обновите оба места.

export const SUPABASE_URL = "https://kqbetheonxiclwgyatnm.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtxYmV0aGVvbnhpY2x3Z3lhdG5tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkzMjgxNjAsImV4cCI6MjA3NDkwNDE2MH0.EETf8kfnnN9NgEj_PKup1cLuZbtORz3RjxWuY65KwlI";
