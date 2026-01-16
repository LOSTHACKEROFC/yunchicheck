-- Create table to store device fingerprints and IPs for blocking
CREATE TABLE public.blocked_devices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fingerprint TEXT,
  ip_address TEXT,
  banned_user_id UUID NOT NULL,
  banned_by_admin_id UUID,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- Create table to track user device fingerprints on login
CREATE TABLE public.user_device_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  fingerprint TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_seen TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for fast lookups
CREATE INDEX idx_blocked_devices_fingerprint ON public.blocked_devices(fingerprint) WHERE is_active = true;
CREATE INDEX idx_blocked_devices_ip ON public.blocked_devices(ip_address) WHERE is_active = true;
CREATE INDEX idx_user_device_logs_user_id ON public.user_device_logs(user_id);
CREATE INDEX idx_user_device_logs_fingerprint ON public.user_device_logs(fingerprint);
CREATE UNIQUE INDEX idx_user_device_logs_unique ON public.user_device_logs(user_id, fingerprint);

-- Enable RLS
ALTER TABLE public.blocked_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_device_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for blocked_devices (admin only + service role)
CREATE POLICY "Service role blocked_devices"
  ON public.blocked_devices FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admin view blocked_devices"
  ON public.blocked_devices FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin manage blocked_devices"
  ON public.blocked_devices FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for user_device_logs (service role for inserts, users can see own)
CREATE POLICY "Service role user_device_logs"
  ON public.user_device_logs FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can view own device logs"
  ON public.user_device_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admin view all device logs"
  ON public.user_device_logs FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));