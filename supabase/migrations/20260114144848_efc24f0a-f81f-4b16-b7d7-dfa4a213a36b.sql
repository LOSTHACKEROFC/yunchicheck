-- Remove the overly permissive public SELECT policy
DROP POLICY IF EXISTS "Anyone can read pending verification by chat id" ON public.pending_verifications;

-- Create a restrictive policy that denies all direct SELECT access
-- All verification checks now go through the check-verification-status edge function
CREATE POLICY "No direct SELECT access to pending verifications"
ON public.pending_verifications
FOR SELECT
USING (false);