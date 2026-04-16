
CREATE TABLE public.blocked_urls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL UNIQUE,
  reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.blocked_urls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage blocked_urls" ON public.blocked_urls FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role blocked_urls" ON public.blocked_urls FOR ALL TO service_role
  USING (true) WITH CHECK (true);

INSERT INTO public.blocked_urls (url, reason) VALUES ('https://charged-cycle-works.myshopify.com', 'Manually blocked by admin');
