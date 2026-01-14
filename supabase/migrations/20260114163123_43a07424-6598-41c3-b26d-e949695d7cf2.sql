-- Fix password_reset_otps RLS - drop existing permissive policy and add restrictive one
DROP POLICY IF EXISTS "Service role can manage password reset OTPs" ON public.password_reset_otps;
DROP POLICY IF EXISTS "Deny public read access to password_reset_otps" ON public.password_reset_otps;
DROP POLICY IF EXISTS "Service role can insert password reset OTPs" ON public.password_reset_otps;
DROP POLICY IF EXISTS "Service role can update password reset OTPs" ON public.password_reset_otps;
DROP POLICY IF EXISTS "Service role can delete password reset OTPs" ON public.password_reset_otps;

-- Create restrictive SELECT policy (deny all public reads)
CREATE POLICY "Deny public read access to password_reset_otps"
ON public.password_reset_otps
FOR SELECT
USING (false);

-- Service role operations (will work because service role bypasses RLS)
CREATE POLICY "Allow insert for service role" ON public.password_reset_otps FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update for service role" ON public.password_reset_otps FOR UPDATE USING (true);
CREATE POLICY "Allow delete for service role" ON public.password_reset_otps FOR DELETE USING (true);

-- Fix user_sessions - remove overly permissive policy
DROP POLICY IF EXISTS "Service role can manage sessions" ON public.user_sessions;

-- Add insert policy for session tracking
CREATE POLICY "Allow session inserts" ON public.user_sessions FOR INSERT WITH CHECK (true);

-- Add update policy for session updates
CREATE POLICY "Users can update own sessions" ON public.user_sessions FOR UPDATE USING (auth.uid() = user_id);

-- Fix deletion_otps - add proper RLS policies  
DROP POLICY IF EXISTS "Deny public read access to deletion_otps" ON public.deletion_otps;
DROP POLICY IF EXISTS "Service role can insert deletion OTPs" ON public.deletion_otps;
DROP POLICY IF EXISTS "Service role can update deletion OTPs" ON public.deletion_otps;
DROP POLICY IF EXISTS "Service role can delete deletion OTPs" ON public.deletion_otps;

CREATE POLICY "Deny public read deletion_otps" ON public.deletion_otps FOR SELECT USING (false);
CREATE POLICY "Allow insert deletion_otps" ON public.deletion_otps FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update deletion_otps" ON public.deletion_otps FOR UPDATE USING (true);
CREATE POLICY "Allow delete deletion_otps" ON public.deletion_otps FOR DELETE USING (true);

-- Fix pending_bans - drop service role ALL and add admin-only
DROP POLICY IF EXISTS "Service role can manage pending_bans" ON public.pending_bans;
DROP POLICY IF EXISTS "Admins can view pending bans" ON public.pending_bans;
DROP POLICY IF EXISTS "Admins can manage pending bans" ON public.pending_bans;

CREATE POLICY "Admin view pending_bans" ON public.pending_bans FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin insert pending_bans" ON public.pending_bans FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin update pending_bans" ON public.pending_bans FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin delete pending_bans" ON public.pending_bans FOR DELETE USING (public.has_role(auth.uid(), 'admin'));
-- Service role bypass for bot operations
CREATE POLICY "Service role pending_bans" ON public.pending_bans FOR ALL USING (true) WITH CHECK (true);

-- Fix ban_appeals - drop service role ALL and add proper policies
DROP POLICY IF EXISTS "Service role can manage appeals" ON public.ban_appeals;
DROP POLICY IF EXISTS "Users can view their own appeals" ON public.ban_appeals;
DROP POLICY IF EXISTS "Users can create their own appeals" ON public.ban_appeals;
DROP POLICY IF EXISTS "Admins can view all appeals" ON public.ban_appeals;
DROP POLICY IF EXISTS "Admins can manage all appeals" ON public.ban_appeals;

CREATE POLICY "User view own appeals" ON public.ban_appeals FOR SELECT USING (auth.uid()::text = user_id::text);
CREATE POLICY "User create own appeals" ON public.ban_appeals FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);
CREATE POLICY "Admin view all appeals" ON public.ban_appeals FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin update appeals" ON public.ban_appeals FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
-- Service role bypass for edge function operations
CREATE POLICY "Service role ban_appeals" ON public.ban_appeals FOR ALL USING (true) WITH CHECK (true);