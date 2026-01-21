-- Fix gateway_urls table: Remove public access policy and restrict to admin-only
-- Issue: Payment Gateway URLs are exposed to all authenticated users

-- Drop the permissive policy that allows any authenticated user to view gateway_urls
DROP POLICY IF EXISTS "Authenticated users can view gateway_urls" ON public.gateway_urls;

-- Create a new policy that only allows admin users to view gateway_urls
CREATE POLICY "Admins can view gateway_urls"
ON public.gateway_urls
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));