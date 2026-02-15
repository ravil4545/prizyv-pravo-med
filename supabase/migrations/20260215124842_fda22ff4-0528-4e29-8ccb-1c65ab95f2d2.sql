UPDATE user_subscriptions 
SET is_paid = false, 
    paid_until = NULL, 
    updated_at = now() 
WHERE user_id != 'a8a968b7-1a98-4e04-9918-17fd8f249f68';