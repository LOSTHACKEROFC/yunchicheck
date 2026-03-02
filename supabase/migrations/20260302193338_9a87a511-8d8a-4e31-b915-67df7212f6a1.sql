
CREATE TABLE public.proxies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip text NOT NULL,
  port text NOT NULL,
  username text,
  password text,
  status text NOT NULL DEFAULT 'live',
  added_by text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  last_checked_at timestamp with time zone
);

ALTER TABLE public.proxies ENABLE ROW LEVEL SECURITY;

-- Only service role can manage proxies
CREATE POLICY "Service role proxies" ON public.proxies FOR ALL USING (true) WITH CHECK (true);

-- Admins can view proxies
CREATE POLICY "Admin view proxies" ON public.proxies FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
