-- Пробный период сокращён с 7 до 3 дней (решение владельца, 2026-06-10).
-- Квота триала — 9 документов и 9 вопросов к ИИ — применяется на фронте
-- (useSubscription: TRIAL_DOC_LIMIT / TRIAL_AI_LIMIT); безлимит только у платных.
-- Затрагивает ТОЛЬКО новые регистрации: существующим пользователям
-- trial_ends_at не пересчитывается.
alter table public.user_subscriptions
  alter column trial_ends_at set default (now() + interval '3 days');
