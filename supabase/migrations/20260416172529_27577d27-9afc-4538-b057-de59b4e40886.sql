
-- Enable pg_cron and pg_net extensions for watchdog scheduling
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Add session tracking columns to pending_bulk_checks
ALTER TABLE public.pending_bulk_checks 
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS message_id integer,
  ADD COLUMN IF NOT EXISTS state_json text;

-- Create index for watchdog to find stale sessions quickly
CREATE INDEX IF NOT EXISTS idx_pending_bulk_checks_updated_at 
  ON public.pending_bulk_checks (updated_at);
