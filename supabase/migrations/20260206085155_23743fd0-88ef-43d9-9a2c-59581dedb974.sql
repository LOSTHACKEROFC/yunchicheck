-- Add column to track last Telegram ID change
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS telegram_changed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.profiles.telegram_changed_at IS 'Timestamp of last Telegram ID change, used for 48-hour cooldown enforcement';