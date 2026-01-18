-- Add email_credit_additions column to notification_preferences table
ALTER TABLE public.notification_preferences 
ADD COLUMN IF NOT EXISTS email_credit_additions boolean DEFAULT true;