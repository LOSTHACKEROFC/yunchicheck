-- Update handle_topup_completion to support both authenticated admin users and service role calls
CREATE OR REPLACE FUNCTION public.handle_topup_completion(p_transaction_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_transaction RECORD;
  v_result JSONB;
  v_credits_to_add INTEGER;
  v_caller_id UUID;
  v_is_admin BOOLEAN;
  v_is_service_role BOOLEAN;
BEGIN
  -- Get the caller's user ID (may be NULL for service role)
  v_caller_id := auth.uid();
  
  -- Check if this is a service role call (auth.uid() is NULL but we can still execute due to SECURITY DEFINER)
  -- Service role bypasses RLS and has full access
  v_is_service_role := (v_caller_id IS NULL);
  
  -- If not service role, verify caller is an admin
  IF NOT v_is_service_role THEN
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = v_caller_id AND role = 'admin'
    ) INTO v_is_admin;
    
    IF NOT v_is_admin THEN
      RETURN jsonb_build_object('success', false, 'error', 'Admin access required');
    END IF;
  END IF;

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
  
  -- The amount field stores credits directly
  v_credits_to_add := v_transaction.amount::INTEGER;
  
  -- Update transaction status
  UPDATE public.topup_transactions
  SET status = 'completed',
      completed_at = now(),
      updated_at = now()
  WHERE id = p_transaction_id;
  
  -- Check if the update was successful
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Failed to update transaction status');
  END IF;
  
  -- Update user credits
  UPDATE public.profiles
  SET credits = credits + v_credits_to_add,
      updated_at = now()
  WHERE user_id = v_transaction.user_id;
  
  -- Check if the credits update was successful
  IF NOT FOUND THEN
    -- Rollback the transaction status update
    UPDATE public.topup_transactions
    SET status = 'pending',
        completed_at = NULL,
        updated_at = now()
    WHERE id = p_transaction_id;
    
    RETURN jsonb_build_object('success', false, 'error', 'Failed to update user credits - user profile not found');
  END IF;
  
  -- Return success with the credited amount
  RETURN jsonb_build_object(
    'success', true, 
    'credits', v_credits_to_add,
    'user_id', v_transaction.user_id,
    'approved_by', COALESCE(v_caller_id::text, 'service_role')
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Database error: ' || SQLERRM);
END;
$function$;