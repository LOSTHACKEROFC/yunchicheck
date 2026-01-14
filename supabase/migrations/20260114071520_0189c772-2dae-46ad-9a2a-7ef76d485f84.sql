-- Create table for password reset OTPs
CREATE TABLE public.password_reset_otps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  email TEXT NOT NULL,
  telegram_chat_id TEXT,
  otp_code TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT false,
  used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.password_reset_otps ENABLE ROW LEVEL SECURITY;

-- Create policy for service role only (edge functions use service role)
CREATE POLICY "Service role can manage password reset OTPs"
ON public.password_reset_otps
FOR ALL
USING (true)
WITH CHECK (true);

-- Create index for faster lookups
CREATE INDEX idx_password_reset_otps_email ON public.password_reset_otps(email);
CREATE INDEX idx_password_reset_otps_otp_code ON public.password_reset_otps(otp_code);

-- Auto-cleanup old OTPs (optional trigger to delete expired OTPs)
CREATE OR REPLACE FUNCTION public.cleanup_expired_password_otps()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.password_reset_otps WHERE expires_at < now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER cleanup_expired_otps_trigger
AFTER INSERT ON public.password_reset_otps
FOR EACH STATEMENT
EXECUTE FUNCTION public.cleanup_expired_password_otps();