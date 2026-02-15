-- Set permanent paid subscription for admin ravil4545@gmail.com
UPDATE public.user_subscriptions 
SET admin_override = true, is_paid = true, paid_until = '2099-12-31T23:59:59+00'
WHERE user_id = 'a8a968b7-1a98-4e04-9918-17fd8f249f68';