-- Create table to store gateway availability status
CREATE TABLE public.gateway_status (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'online' CHECK (status IN ('online', 'offline', 'unavailable')),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by TEXT
);

-- Enable RLS
ALTER TABLE public.gateway_status ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role gateway_status" 
ON public.gateway_status 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Allow authenticated users to read gateway status
CREATE POLICY "Authenticated users can view gateway_status" 
ON public.gateway_status 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Insert default gateway statuses
INSERT INTO public.gateway_status (id, name, status) VALUES
  ('stripe_auth', 'YUNCHI AUTH 1', 'online'),
  ('combined_auth', 'YUNCHI AUTH 2', 'online'),
  ('braintree_auth', 'YUNCHI AUTH 3', 'online'),
  ('clover_charge', 'CLOVER CHARGE', 'online'),
  ('square_charge', 'SQUARE CHARGE', 'online'),
  ('shopify_charge', 'SHOPIFY CHARGE', 'online'),
  ('paygate_charge', 'PAYGATE', 'online'),
  ('payu_charge', 'PayU', 'online')
ON CONFLICT (id) DO NOTHING;