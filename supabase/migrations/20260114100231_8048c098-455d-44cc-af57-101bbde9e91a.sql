-- Enable REPLICA IDENTITY FULL for all tables
ALTER TABLE public.profiles REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.support_tickets REPLICA IDENTITY FULL;
ALTER TABLE public.ticket_messages REPLICA IDENTITY FULL;
ALTER TABLE public.card_checks REPLICA IDENTITY FULL;
ALTER TABLE public.user_sessions REPLICA IDENTITY FULL;
ALTER TABLE public.site_stats REPLICA IDENTITY FULL;
ALTER TABLE public.ban_appeals REPLICA IDENTITY FULL;
ALTER TABLE public.pending_verifications REPLICA IDENTITY FULL;
ALTER TABLE public.password_reset_otps REPLICA IDENTITY FULL;
ALTER TABLE public.pending_bans REPLICA IDENTITY FULL;
ALTER TABLE public.user_roles REPLICA IDENTITY FULL;
ALTER TABLE public.notification_reads REPLICA IDENTITY FULL;
ALTER TABLE public.deleted_notifications REPLICA IDENTITY FULL;

-- Add remaining tables to realtime publication (profiles already added)
DO $$
BEGIN
  -- notifications
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
  
  -- support_tickets
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'support_tickets') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;
  END IF;
  
  -- ticket_messages
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'ticket_messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_messages;
  END IF;
  
  -- card_checks
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'card_checks') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.card_checks;
  END IF;
  
  -- user_sessions
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'user_sessions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_sessions;
  END IF;
  
  -- site_stats
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'site_stats') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.site_stats;
  END IF;
  
  -- ban_appeals
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'ban_appeals') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ban_appeals;
  END IF;
  
  -- pending_verifications
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'pending_verifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pending_verifications;
  END IF;
  
  -- password_reset_otps
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'password_reset_otps') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.password_reset_otps;
  END IF;
  
  -- pending_bans
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'pending_bans') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pending_bans;
  END IF;
  
  -- user_roles
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'user_roles') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_roles;
  END IF;
  
  -- notification_reads
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'notification_reads') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_reads;
  END IF;
  
  -- deleted_notifications
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'deleted_notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.deleted_notifications;
  END IF;
END $$;