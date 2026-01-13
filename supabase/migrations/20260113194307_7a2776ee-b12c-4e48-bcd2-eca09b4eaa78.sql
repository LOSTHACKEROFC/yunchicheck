-- Create ticket_messages table for conversation
CREATE TABLE public.ticket_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  message text NOT NULL,
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;

-- Users can view messages for their own tickets
CREATE POLICY "Users can view their ticket messages"
ON public.ticket_messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.support_tickets 
    WHERE support_tickets.id = ticket_messages.ticket_id 
    AND support_tickets.user_id = auth.uid()
  )
);

-- Users can insert messages to their own tickets
CREATE POLICY "Users can send messages to their tickets"
ON public.ticket_messages
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.support_tickets 
    WHERE support_tickets.id = ticket_messages.ticket_id 
    AND support_tickets.user_id = auth.uid()
  )
  AND is_admin = false
);

-- Service role can insert admin messages
CREATE POLICY "Service role can insert admin messages"
ON public.ticket_messages
FOR INSERT
TO service_role
WITH CHECK (true);

-- Enable realtime
ALTER TABLE public.ticket_messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_messages;