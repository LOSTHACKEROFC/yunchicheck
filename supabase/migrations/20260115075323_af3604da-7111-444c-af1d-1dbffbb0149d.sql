-- Update the notify_on_balance_change function to only notify for credit additions (top-ups)
-- Don't notify for deductions (card checks)
CREATE OR REPLACE FUNCTION public.notify_on_balance_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  credits_diff INTEGER;
  notif_title TEXT;
  notif_message TEXT;
BEGIN
  credits_diff := NEW.credits - OLD.credits;
  
  -- Only create notifications for credit additions (top-ups), not deductions (card checks)
  IF credits_diff > 0 THEN
    notif_title := 'Credits Added';
    notif_message := 'Your account has been credited with ' || credits_diff || ' credits';
    
    INSERT INTO public.notifications (user_id, type, title, message, metadata)
    VALUES (
      NEW.user_id,
      'credits_update',
      notif_title,
      notif_message,
      jsonb_build_object('old_credits', OLD.credits, 'new_credits', NEW.credits, 'difference', credits_diff)
    );
  END IF;
  
  RETURN NEW;
END;
$$;