-- Fix 1: Add admin SELECT policy for support_tickets
CREATE POLICY "Admins can view all tickets"
ON public.support_tickets
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Fix 2: Restrict site_stats to authenticated users only
DROP POLICY IF EXISTS "Anyone can view stats" ON public.site_stats;
CREATE POLICY "Authenticated users can view stats"
ON public.site_stats
FOR SELECT
USING (auth.uid() IS NOT NULL);