
-- Allow moderators to view topup_transactions
CREATE POLICY "Moderators can view all topup transactions"
ON public.topup_transactions
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'moderator'::app_role));

-- Allow moderators to update topup_transactions (for rejections)
CREATE POLICY "Moderators can update topup transactions"
ON public.topup_transactions
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'moderator'::app_role))
WITH CHECK (has_role(auth.uid(), 'moderator'::app_role));

-- Update handle_topup_completion to allow moderators
CREATE OR REPLACE FUNCTION public.handle_topup_completion(p_transaction_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_transaction RECORD;
  v_result JSONB;
  v_credits_to_add INTEGER;
  v_caller_id UUID;
  v_is_admin BOOLEAN;
  v_is_moderator BOOLEAN;
  v_is_service_role BOOLEAN;
BEGIN
  v_caller_id := auth.uid();
  v_is_service_role := (v_caller_id IS NULL);
  
  IF NOT v_is_service_role THEN
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = v_caller_id AND role = 'admin'
    ) INTO v_is_admin;
    
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = v_caller_id AND role = 'moderator'
    ) INTO v_is_moderator;
    
    IF NOT v_is_admin AND NOT v_is_moderator THEN
      RETURN jsonb_build_object('success', false, 'error', 'Staff access required');
    END IF;
  END IF;

  SELECT * INTO v_transaction
  FROM public.topup_transactions
  WHERE id = p_transaction_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transaction not found');
  END IF;
  
  IF v_transaction.status = 'completed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transaction already completed');
  END IF;
  
  v_credits_to_add := v_transaction.amount::INTEGER;
  
  UPDATE public.topup_transactions
  SET status = 'completed',
      completed_at = now(),
      updated_at = now()
  WHERE id = p_transaction_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Failed to update transaction status');
  END IF;
  
  UPDATE public.profiles
  SET credits = credits + v_credits_to_add,
      updated_at = now()
  WHERE user_id = v_transaction.user_id;
  
  IF NOT FOUND THEN
    UPDATE public.topup_transactions
    SET status = 'pending',
        completed_at = NULL,
        updated_at = now()
    WHERE id = p_transaction_id;
    
    RETURN jsonb_build_object('success', false, 'error', 'Failed to update user credits - user profile not found');
  END IF;
  
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

-- Allow moderators to view profiles (needed to see usernames in topup list)
CREATE POLICY "Moderators can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'moderator'::app_role));
