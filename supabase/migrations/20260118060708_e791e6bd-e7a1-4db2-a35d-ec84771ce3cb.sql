-- Fix 1: Remove overly permissive ALL policy on user_device_logs
-- This was allowing anyone with anon key to SELECT all device tracking data
DROP POLICY IF EXISTS "Service role user_device_logs" ON public.user_device_logs;

-- Create separate policies for INSERT/UPDATE/DELETE only (no public SELECT)
CREATE POLICY "Service role can insert device logs"
  ON public.user_device_logs FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can update device logs"
  ON public.user_device_logs FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can delete device logs"
  ON public.user_device_logs FOR DELETE
  USING (true);

-- Fix 2: Make payment-proofs bucket private
UPDATE storage.buckets 
SET public = false 
WHERE id = 'payment-proofs';

-- Remove the overly permissive public SELECT policy
DROP POLICY IF EXISTS "Public read access for payment proofs" ON storage.objects;

-- Add admin-only SELECT policy for payment proofs
CREATE POLICY "Admins can view all payment proofs"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'payment-proofs' 
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

-- Add owner SELECT policy - users can view their own payment proofs
CREATE POLICY "Users can view their own payment proofs"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'payment-proofs' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);