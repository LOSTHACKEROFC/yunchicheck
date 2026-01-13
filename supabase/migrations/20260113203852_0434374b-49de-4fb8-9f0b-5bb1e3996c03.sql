-- Add priority column to support_tickets
ALTER TABLE public.support_tickets 
ADD COLUMN priority text NOT NULL DEFAULT 'medium';

-- Add check constraint for valid priority values
ALTER TABLE public.support_tickets 
ADD CONSTRAINT valid_priority CHECK (priority IN ('low', 'medium', 'high', 'urgent'));