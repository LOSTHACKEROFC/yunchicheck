
CREATE TABLE public.user_proxies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  ip text NOT NULL,
  port text NOT NULL,
  username text,
  password text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.user_proxies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own proxies" ON public.user_proxies FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own proxies" ON public.user_proxies FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own proxies" ON public.user_proxies FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Users can update own proxies" ON public.user_proxies FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Service role user_proxies" ON public.user_proxies FOR ALL USING (true) WITH CHECK (true);
