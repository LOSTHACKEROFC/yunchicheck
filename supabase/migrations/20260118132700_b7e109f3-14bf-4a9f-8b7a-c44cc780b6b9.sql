-- Create table to track active health check scans
CREATE TABLE public.health_check_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id TEXT NOT NULL,
  message_id INTEGER NOT NULL,
  is_stopped BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.health_check_sessions ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role health_check_sessions" 
ON public.health_check_sessions 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Create index for quick lookup
CREATE INDEX idx_health_check_sessions_chat_message ON public.health_check_sessions(chat_id, message_id);