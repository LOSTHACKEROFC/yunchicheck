-- Add banned_until column for temporary bans
ALTER TABLE public.profiles 
ADD COLUMN banned_until TIMESTAMP WITH TIME ZONE;

-- Add ban_duration to pending_bans for multi-step flow
ALTER TABLE public.pending_bans
ADD COLUMN ban_reason TEXT,
ADD COLUMN step TEXT DEFAULT 'reason';