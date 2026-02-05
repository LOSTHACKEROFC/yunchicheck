-- Create table to track broadcasted cards and prevent duplicates
CREATE TABLE public.broadcasted_cards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  card_hash TEXT NOT NULL,
  gateway TEXT NOT NULL,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for fast lookup by card hash
CREATE INDEX idx_broadcasted_cards_hash ON public.broadcasted_cards(card_hash);

-- Create index for cleanup of old records
CREATE INDEX idx_broadcasted_cards_created_at ON public.broadcasted_cards(created_at);

-- Enable RLS (admins only for security)
ALTER TABLE public.broadcasted_cards ENABLE ROW LEVEL SECURITY;

-- Only service role can access this table
CREATE POLICY "Service role only" ON public.broadcasted_cards
  FOR ALL USING (false);

-- Add comment
COMMENT ON TABLE public.broadcasted_cards IS 'Tracks broadcasted cards to prevent duplicate Telegram channel notifications';