-- Add result column to card_checks table to store live/dead/unknown status
ALTER TABLE public.card_checks 
ADD COLUMN result text DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.card_checks.result IS 'The result of the card check: live, dead, or unknown';