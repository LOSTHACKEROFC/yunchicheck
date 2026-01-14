-- First, drop the trigger that uses the old function
DROP TRIGGER IF EXISTS on_balance_change ON public.profiles;

-- Now we can safely rename the column
ALTER TABLE public.profiles 
  RENAME COLUMN balance TO credits;

-- Update existing balances: multiply by 10 to convert dollars to credits
UPDATE public.profiles 
SET credits = credits * 10;

-- Change the data type to INTEGER since credits are whole numbers
ALTER TABLE public.profiles 
  ALTER COLUMN credits TYPE INTEGER USING ROUND(credits)::INTEGER;

-- Set default to 0 for new users
ALTER TABLE public.profiles 
  ALTER COLUMN credits SET DEFAULT 0;

-- Update the handle_topup_completion function to work with credits
CREATE OR REPLACE FUNCTION public.handle_topup_completion(p_transaction_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transaction RECORD;
  v_result JSONB;
  v_credits_to_add INTEGER;
BEGIN
  -- Get the transaction
  SELECT * INTO v_transaction
  FROM public.topup_transactions
  WHERE id = p_transaction_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transaction not found');
  END IF;
  
  IF v_transaction.status = 'completed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transaction already completed');
  END IF;
  
  -- The amount field now stores credits directly
  v_credits_to_add := v_transaction.amount::INTEGER;
  
  -- Update transaction status
  UPDATE public.topup_transactions
  SET status = 'completed',
      completed_at = now(),
      updated_at = now()
  WHERE id = p_transaction_id;
  
  -- Update user credits
  UPDATE public.profiles
  SET credits = credits + v_credits_to_add,
      updated_at = now()
  WHERE user_id = v_transaction.user_id;
  
  RETURN jsonb_build_object(
    'success', true, 
    'credits', v_credits_to_add,
    'user_id', v_transaction.user_id
  );
END;
$$;

-- Replace the notify function to work with credits
CREATE OR REPLACE FUNCTION public.notify_on_balance_change()
RETURNS trigger
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
  
  IF credits_diff != 0 THEN
    IF credits_diff > 0 THEN
      notif_title := 'Credits Added';
      notif_message := 'Your account has been credited with ' || credits_diff || ' credits';
    ELSE
      notif_title := 'Credits Deducted';
      notif_message := ABS(credits_diff) || ' credits have been deducted from your account';
    END IF;
    
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

-- Create the trigger for credits changes
CREATE TRIGGER on_credits_change
  AFTER UPDATE OF credits ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_balance_change();