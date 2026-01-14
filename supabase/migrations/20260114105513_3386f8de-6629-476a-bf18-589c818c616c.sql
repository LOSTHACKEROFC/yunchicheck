-- Drop the existing check constraint and recreate with the announcement type
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

-- Add the updated check constraint that includes 'announcement'
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check 
CHECK (type IN ('ticket_reply', 'balance_update', 'system', 'topup', 'announcement'));