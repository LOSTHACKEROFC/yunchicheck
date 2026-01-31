-- Add attempt tracking columns to OTP tables for brute force protection
ALTER TABLE public.password_reset_otps 
ADD COLUMN IF NOT EXISTS attempt_count INTEGER DEFAULT 0;

ALTER TABLE public.deletion_otps 
ADD COLUMN IF NOT EXISTS attempt_count INTEGER DEFAULT 0;

-- Mask existing card data in card_checks table (remove CVV, keep only last 4 digits)
UPDATE public.card_checks 
SET card_details = CONCAT(
  '****',
  RIGHT(SPLIT_PART(card_details, '|', 1), 4),
  '|',
  SPLIT_PART(card_details, '|', 2),
  '|',
  SPLIT_PART(card_details, '|', 3)
)
WHERE card_details IS NOT NULL
  AND card_details LIKE '%|%|%|%';