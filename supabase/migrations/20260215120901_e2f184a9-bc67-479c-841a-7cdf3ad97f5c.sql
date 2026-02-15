-- Backfill subscription records for existing users
INSERT INTO public.user_subscriptions (user_id)
SELECT p.id FROM public.profiles p
LEFT JOIN public.user_subscriptions us ON us.user_id = p.id
WHERE us.id IS NULL
ON CONFLICT (user_id) DO NOTHING;