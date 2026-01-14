-- Create function to notify banned users via Telegram
CREATE OR REPLACE FUNCTION public.notify_user_banned()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  supabase_url TEXT;
  service_role_key TEXT;
BEGIN
  -- Only trigger when is_banned changes from false to true
  IF NEW.is_banned = true AND (OLD.is_banned = false OR OLD.is_banned IS NULL) THEN
    -- Get Supabase URL from environment
    supabase_url := current_setting('app.settings.supabase_url', true);
    
    -- Only send notification if user has a Telegram chat ID
    IF NEW.telegram_chat_id IS NOT NULL THEN
      -- Use pg_net to call the edge function
      PERFORM net.http_post(
        url := 'https://joboegjaowcwulqitchu.supabase.co/functions/v1/notify-user-banned',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        ),
        body := jsonb_build_object(
          'user_id', NEW.user_id,
          'telegram_chat_id', NEW.telegram_chat_id,
          'ban_reason', NEW.ban_reason,
          'username', NEW.username
        )
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on profiles table
DROP TRIGGER IF EXISTS on_user_banned ON public.profiles;
CREATE TRIGGER on_user_banned
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_user_banned();