-- Drop the old trigger function and create a proper RPC function
DROP FUNCTION IF EXISTS public.handle_topup_completion() CASCADE;

-- Create RPC function that takes transaction_id as parameter
CREATE OR REPLACE FUNCTION public.handle_topup_completion(p_transaction_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transaction RECORD;
  v_result JSONB;
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
  
  -- Update transaction status
  UPDATE public.topup_transactions
  SET status = 'completed',
      completed_at = now(),
      updated_at = now()
  WHERE id = p_transaction_id;
  
  -- Update user balance
  UPDATE public.profiles
  SET balance = balance + v_transaction.amount,
      updated_at = now()
  WHERE user_id = v_transaction.user_id;
  
  RETURN jsonb_build_object(
    'success', true, 
    'amount', v_transaction.amount,
    'user_id', v_transaction.user_id
  );
END;
$$;