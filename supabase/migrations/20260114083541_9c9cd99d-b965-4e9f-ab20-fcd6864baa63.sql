-- Create table for ban appeals
CREATE TABLE public.ban_appeals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  email TEXT NOT NULL,
  username TEXT,
  telegram_chat_id TEXT,
  ban_reason TEXT,
  appeal_message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_response TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  resolved_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.ban_appeals ENABLE ROW LEVEL SECURITY;

-- Service role can manage all appeals
CREATE POLICY "Service role can manage appeals"
  ON public.ban_appeals
  FOR ALL
  USING (true)
  WITH CHECK (true);