-- Create deletion_otps table for account deletion verification
CREATE TABLE public.deletion_otps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  email TEXT NOT NULL,
  otp_hash TEXT NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.deletion_otps ENABLE ROW LEVEL SECURITY;

-- Only service role can access this table (edge functions)
-- No user-facing policies needed

-- Auto-cleanup expired OTPs
CREATE OR REPLACE FUNCTION public.cleanup_expired_deletion_otps()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.deletion_otps WHERE expires_at < now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER cleanup_deletion_otps_trigger
  AFTER INSERT ON public.deletion_otps
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.cleanup_expired_deletion_otps();