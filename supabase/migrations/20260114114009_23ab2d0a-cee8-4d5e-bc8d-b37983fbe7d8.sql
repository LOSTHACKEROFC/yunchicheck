-- Create function to notify on topup status change
CREATE OR REPLACE FUNCTION public.notify_topup_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only trigger when status changes to completed or failed
  IF (NEW.status = 'completed' OR NEW.status = 'failed') AND OLD.status = 'pending' THEN
    -- Call the edge function via pg_net
    PERFORM net.http_post(
      url := 'https://joboegjaowcwulqitchu.supabase.co/functions/v1/notify-topup-status',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := jsonb_build_object(
        'transaction_id', NEW.id,
        'user_id', NEW.user_id,
        'amount', NEW.amount,
        'status', NEW.status,
        'payment_method', NEW.payment_method
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for topup status notifications
CREATE TRIGGER on_topup_status_notify
AFTER UPDATE ON public.topup_transactions
FOR EACH ROW
EXECUTE FUNCTION public.notify_topup_status_change();