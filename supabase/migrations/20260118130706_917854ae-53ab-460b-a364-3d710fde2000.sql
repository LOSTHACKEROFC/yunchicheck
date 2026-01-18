-- Create table to store gateway URLs
CREATE TABLE public.gateway_urls (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.gateway_urls ENABLE ROW LEVEL SECURITY;

-- Allow admins full access
CREATE POLICY "Admins can manage gateway_urls" 
ON public.gateway_urls 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Allow all authenticated users to view
CREATE POLICY "Authenticated users can view gateway_urls" 
ON public.gateway_urls 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Allow service role full access
CREATE POLICY "Service role gateway_urls" 
ON public.gateway_urls 
FOR ALL 
USING (true)
WITH CHECK (true);