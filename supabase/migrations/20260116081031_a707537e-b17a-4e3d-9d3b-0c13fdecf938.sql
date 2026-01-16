-- Fix security issues: restrict user UPDATE on profiles to prevent self-unbanning
-- and add admin access for profile management

-- Drop the existing overly permissive UPDATE policy
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

-- Create a new restrictive UPDATE policy that only allows updating safe fields
-- Users cannot modify: is_banned, banned_at, banned_until, ban_reason, credits, user_id
CREATE POLICY "Users can update their own safe profile fields"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND is_banned IS NOT DISTINCT FROM (SELECT is_banned FROM public.profiles WHERE user_id = auth.uid())
  AND banned_at IS NOT DISTINCT FROM (SELECT banned_at FROM public.profiles WHERE user_id = auth.uid())
  AND banned_until IS NOT DISTINCT FROM (SELECT banned_until FROM public.profiles WHERE user_id = auth.uid())
  AND ban_reason IS NOT DISTINCT FROM (SELECT ban_reason FROM public.profiles WHERE user_id = auth.uid())
  AND credits IS NOT DISTINCT FROM (SELECT credits FROM public.profiles WHERE user_id = auth.uid())
);

-- Add admin SELECT policy for profiles (admins can view all profiles)
CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Add admin UPDATE policy for profiles (admins can update any profile including ban fields)
CREATE POLICY "Admins can update all profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Add admin SELECT policy for card_checks (admins can view all checks)
CREATE POLICY "Admins can view all card checks"
ON public.card_checks
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));