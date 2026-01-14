-- Add proof_image_url column to topup_transactions table
ALTER TABLE public.topup_transactions
ADD COLUMN IF NOT EXISTS proof_image_url TEXT;

-- Create storage bucket for payment proofs
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-proofs', 'payment-proofs', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload their payment proofs
CREATE POLICY "Users can upload their payment proofs"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'payment-proofs' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow public read access to payment proofs (for admin to view)
CREATE POLICY "Public read access for payment proofs"
ON storage.objects
FOR SELECT
USING (bucket_id = 'payment-proofs');

-- Allow users to update their own payment proofs
CREATE POLICY "Users can update their payment proofs"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'payment-proofs' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow users to delete their own payment proofs
CREATE POLICY "Users can delete their payment proofs"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'payment-proofs' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);