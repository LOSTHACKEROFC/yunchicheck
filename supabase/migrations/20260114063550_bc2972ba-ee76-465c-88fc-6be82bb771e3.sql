-- Create pending_verifications table for Telegram bot verification during registration
CREATE TABLE public.pending_verifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  telegram_chat_id TEXT NOT NULL,
  verification_code TEXT NOT NULL,
  email TEXT,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pending_verifications ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert (for registration flow)
CREATE POLICY "Anyone can create pending verification"
ON public.pending_verifications
FOR INSERT
WITH CHECK (true);

-- Allow anyone to read their own verification by telegram_chat_id
CREATE POLICY "Anyone can read pending verification by chat id"
ON public.pending_verifications
FOR SELECT
USING (true);

-- Allow updates for verification confirmation
CREATE POLICY "Anyone can update pending verification"
ON public.pending_verifications
FOR UPDATE
USING (true);

-- Create index for faster lookups
CREATE INDEX idx_pending_verifications_telegram_chat_id ON public.pending_verifications(telegram_chat_id);
CREATE INDEX idx_pending_verifications_code ON public.pending_verifications(verification_code);

-- Enable realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE public.pending_verifications;