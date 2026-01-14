-- Create table for pending ban operations (for multi-step ban flow)
CREATE TABLE public.pending_bans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_chat_id TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL,
  username TEXT,
  user_email TEXT,
  user_telegram_chat_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pending_bans ENABLE ROW LEVEL SECURITY;

-- Service role can manage pending bans
CREATE POLICY "Service role can manage pending_bans"
  ON public.pending_bans
  FOR ALL
  USING (true)
  WITH CHECK (true);