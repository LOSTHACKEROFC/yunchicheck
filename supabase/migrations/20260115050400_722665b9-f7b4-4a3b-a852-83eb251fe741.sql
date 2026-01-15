-- Update the check_spending_alerts function to use 1 credit per check instead of 5
CREATE OR REPLACE FUNCTION public.check_spending_alerts()
RETURNS TRIGGER AS $$
DECLARE
  user_settings RECORD;
  daily_spending INT;
  weekly_spending INT;
BEGIN
  -- Only process completed checks
  IF NEW.status != 'completed' THEN
    RETURN NEW;
  END IF;

  -- Get user's spending alert settings
  SELECT * INTO user_settings
  FROM public.spending_alert_settings
  WHERE user_id = NEW.user_id AND enabled = true;

  -- If no settings or disabled, skip
  IF user_settings IS NULL THEN
    RETURN NEW;
  END IF;

  -- Calculate daily spending (completed checks * 1 credit)
  SELECT COALESCE(COUNT(*) * 1, 0) INTO daily_spending
  FROM public.card_checks
  WHERE user_id = NEW.user_id 
    AND status = 'completed'
    AND created_at >= CURRENT_DATE;

  -- Calculate weekly spending
  SELECT COALESCE(COUNT(*) * 1, 0) INTO weekly_spending
  FROM public.card_checks
  WHERE user_id = NEW.user_id 
    AND status = 'completed'
    AND created_at >= date_trunc('week', CURRENT_DATE);

  -- Check daily threshold
  IF user_settings.daily_threshold > 0 
     AND daily_spending >= user_settings.daily_threshold 
     AND (user_settings.last_daily_alert IS NULL OR user_settings.last_daily_alert < CURRENT_DATE) THEN
    
    -- Create daily alert notification
    INSERT INTO public.notifications (user_id, type, title, message, metadata)
    VALUES (
      NEW.user_id,
      'spending_alert',
      'Daily Spending Alert',
      'You have reached your daily spending threshold of ' || user_settings.daily_threshold || ' credits.',
      jsonb_build_object('threshold_type', 'daily', 'threshold', user_settings.daily_threshold, 'current_spending', daily_spending)
    );

    -- Update last alert time
    UPDATE public.spending_alert_settings
    SET last_daily_alert = CURRENT_DATE
    WHERE user_id = NEW.user_id;
  END IF;

  -- Check weekly threshold
  IF user_settings.weekly_threshold > 0 
     AND weekly_spending >= user_settings.weekly_threshold 
     AND (user_settings.last_weekly_alert IS NULL OR user_settings.last_weekly_alert < date_trunc('week', CURRENT_DATE)) THEN
    
    -- Create weekly alert notification
    INSERT INTO public.notifications (user_id, type, title, message, metadata)
    VALUES (
      NEW.user_id,
      'spending_alert',
      'Weekly Spending Alert',
      'You have reached your weekly spending threshold of ' || user_settings.weekly_threshold || ' credits.',
      jsonb_build_object('threshold_type', 'weekly', 'threshold', user_settings.weekly_threshold, 'current_spending', weekly_spending)
    );

    -- Update last alert time
    UPDATE public.spending_alert_settings
    SET last_weekly_alert = date_trunc('week', CURRENT_DATE)
    WHERE user_id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;