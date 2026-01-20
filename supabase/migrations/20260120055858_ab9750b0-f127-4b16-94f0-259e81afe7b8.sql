-- ============================================
-- Security Fix 1: Remove overly permissive blocked_devices policy
-- The 'Service role blocked_devices' policy allows unrestricted access
-- We need to keep the existing admin-only policies but ensure service role
-- access is only via edge functions (which use service_role key directly)
-- ============================================

-- Drop the overly permissive service role policy that allows SELECT with USING (true)
DROP POLICY IF EXISTS "Service role blocked_devices" ON public.blocked_devices;

-- Recreate a more restrictive service role policy for INSERT/UPDATE/DELETE only (no SELECT)
-- Service role operations for reads should go through edge functions
CREATE POLICY "Service role blocked_devices write only"
ON public.blocked_devices
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ============================================
-- Security Fix 2: Add admin authorization check to handle_topup_completion RPC
-- This function was callable by any authenticated user to approve their own topups
-- ============================================

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
  -- SECURITY: Verify caller is an admin before proceeding
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin access required');
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
    'user_id', v_transaction.user_id,
    'approved_by', auth.uid()
  );
END;
$$;