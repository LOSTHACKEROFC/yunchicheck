-- Add card_details column to store full card info for history display
ALTER TABLE public.card_checks 
ADD COLUMN card_details text DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.card_checks.card_details IS 'Full card details in format: cardnumber|mm|yy|cvv';