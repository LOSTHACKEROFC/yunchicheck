-- Create table to track read notifications
CREATE TABLE public.notification_reads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  message_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, message_id)
);

-- Enable RLS
ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;

-- Users can view their own read notifications
CREATE POLICY "Users can view their own reads"
ON public.notification_reads
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own reads
CREATE POLICY "Users can insert their own reads"
ON public.notification_reads
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own reads
CREATE POLICY "Users can delete their own reads"
ON public.notification_reads
FOR DELETE
USING (auth.uid() = user_id);

-- Create table for deleted notifications
CREATE TABLE public.deleted_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  message_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, message_id)
);

-- Enable RLS
ALTER TABLE public.deleted_notifications ENABLE ROW LEVEL SECURITY;

-- Users can view their own deleted notifications
CREATE POLICY "Users can view their own deleted"
ON public.deleted_notifications
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own deleted
CREATE POLICY "Users can insert their own deleted"
ON public.deleted_notifications
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own deleted notifications
CREATE POLICY "Users can delete their own deleted"
ON public.deleted_notifications
FOR DELETE
USING (auth.uid() = user_id);