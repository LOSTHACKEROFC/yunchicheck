CREATE TABLE public.pending_bulk_checks (
  id TEXT PRIMARY KEY,
  cards TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pending_bulk_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on pending_bulk_checks"
ON public.pending_bulk_checks
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
