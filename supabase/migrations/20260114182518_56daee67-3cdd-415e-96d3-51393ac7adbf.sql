-- Add spending_alert type to notifications check constraint
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check 
  CHECK (type IN ('ticket_reply', 'balance_update', 'system', 'topup', 'announcement', 'topup_approved', 'topup_rejected', 'credits_update', 'spending_alert'));

-- Create a table to store user spending alert preferences
CREATE TABLE IF NOT EXISTS public.spending_alert_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  daily_threshold INTEGER DEFAULT 0,
  weekly_threshold INTEGER DEFAULT 0,
  enabled BOOLEAN DEFAULT true,
  last_daily_alert TIMESTAMP WITH TIME ZONE,
  last_weekly_alert TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.spending_alert_settings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own spending alert settings"
ON public.spending_alert_settings
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own spending alert settings"
ON public.spending_alert_settings
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own spending alert settings"
ON public.spending_alert_settings
FOR UPDATE
USING (auth.uid() = user_id);

-- Create function to check spending and send alerts
CREATE OR REPLACE FUNCTION public.check_spending_alerts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  settings_record RECORD;
  daily_spending INTEGER;
  weekly_spending INTEGER;
  should_alert_daily BOOLEAN := false;
  should_alert_weekly BOOLEAN := false;
BEGIN
  -- Only trigger on completed checks (credits deducted)
  IF NEW.status != 'completed' THEN
    RETURN NEW;
  END IF;

  -- Get user's spending alert settings
  SELECT * INTO settings_record
  FROM public.spending_alert_settings
  WHERE user_id = NEW.user_id AND enabled = true;

  -- If no settings or not enabled, skip
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Calculate daily spending (completed checks * 5 credits)
  SELECT COALESCE(COUNT(*) * 5, 0) INTO daily_spending
  FROM public.card_checks
  WHERE user_id = NEW.user_id 
    AND status = 'completed'
    AND created_at >= CURRENT_DATE;

  -- Calculate weekly spending
  SELECT COALESCE(COUNT(*) * 5, 0) INTO weekly_spending
  FROM public.card_checks
  WHERE user_id = NEW.user_id 
    AND status = 'completed'
    AND created_at >= date_trunc('week', CURRENT_DATE);

  -- Check daily threshold
  IF settings_record.daily_threshold > 0 AND daily_spending >= settings_record.daily_threshold THEN
    -- Only alert once per day
    IF settings_record.last_daily_alert IS NULL OR settings_record.last_daily_alert < CURRENT_DATE THEN
      should_alert_daily := true;
    END IF;
  END IF;

  -- Check weekly threshold
  IF settings_record.weekly_threshold > 0 AND weekly_spending >= settings_record.weekly_threshold THEN
    -- Only alert once per week
    IF settings_record.last_weekly_alert IS NULL OR settings_record.last_weekly_alert < date_trunc('week', CURRENT_DATE) THEN
      should_alert_weekly := true;
    END IF;
  END IF;

  -- Send daily alert
  IF should_alert_daily THEN
    INSERT INTO public.notifications (user_id, type, title, message, metadata)
    VALUES (
      NEW.user_id,
      'spending_alert',
      'Daily Spending Alert',
      'You have spent ' || daily_spending || ' credits today, exceeding your daily threshold of ' || settings_record.daily_threshold || ' credits.',
      jsonb_build_object('alert_type', 'daily', 'spent', daily_spending, 'threshold', settings_record.daily_threshold)
    );

    UPDATE public.spending_alert_settings
    SET last_daily_alert = now()
    WHERE user_id = NEW.user_id;
  END IF;

  -- Send weekly alert
  IF should_alert_weekly THEN
    INSERT INTO public.notifications (user_id, type, title, message, metadata)
    VALUES (
      NEW.user_id,
      'spending_alert',
      'Weekly Spending Alert',
      'You have spent ' || weekly_spending || ' credits this week, exceeding your weekly threshold of ' || settings_record.weekly_threshold || ' credits.',
      jsonb_build_object('alert_type', 'weekly', 'spent', weekly_spending, 'threshold', settings_record.weekly_threshold)
    );

    UPDATE public.spending_alert_settings
    SET last_weekly_alert = now()
    WHERE user_id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger on card_checks
DROP TRIGGER IF EXISTS check_spending_alerts_trigger ON public.card_checks;
CREATE TRIGGER check_spending_alerts_trigger
  AFTER INSERT ON public.card_checks
  FOR EACH ROW
  EXECUTE FUNCTION public.check_spending_alerts();

-- Update timestamp trigger
CREATE TRIGGER update_spending_alert_settings_updated_at
  BEFORE UPDATE ON public.spending_alert_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();