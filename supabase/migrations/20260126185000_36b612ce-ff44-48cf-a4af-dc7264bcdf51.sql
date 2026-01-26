-- Create a private storage bucket for card exports
INSERT INTO storage.buckets (id, name, public)
VALUES ('card-exports', 'card-exports', false)
ON CONFLICT (id) DO NOTHING;

-- Admin-only policies for card exports bucket
CREATE POLICY "Admins can view card exports"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'card-exports' 
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can upload card exports"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'card-exports' 
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can delete card exports"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'card-exports' 
  AND public.has_role(auth.uid(), 'admin')
);