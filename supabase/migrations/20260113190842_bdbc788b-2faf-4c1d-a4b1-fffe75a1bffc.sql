-- Create card_checks table to track all checks
CREATE TABLE public.card_checks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gateway TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.card_checks ENABLE ROW LEVEL SECURITY;

-- Users can view their own checks
CREATE POLICY "Users can view their own checks"
ON public.card_checks FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own checks
CREATE POLICY "Users can insert their own checks"
ON public.card_checks FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Create stats table for global counters (public readable)
CREATE TABLE public.site_stats (
  id TEXT PRIMARY KEY DEFAULT 'global',
  total_users INTEGER NOT NULL DEFAULT 0,
  total_checks INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS with public read access
ALTER TABLE public.site_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view stats"
ON public.site_stats FOR SELECT
USING (true);

-- Insert initial stats row
INSERT INTO public.site_stats (id, total_users, total_checks) VALUES ('global', 0, 0);

-- Function to update user count
CREATE OR REPLACE FUNCTION public.update_user_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.site_stats 
  SET total_users = (SELECT COUNT(*) FROM public.profiles),
      updated_at = now()
  WHERE id = 'global';
  RETURN NEW;
END;
$$;

-- Trigger to update user count on new profile
CREATE TRIGGER on_profile_created
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_user_count();

-- Function to update check count
CREATE OR REPLACE FUNCTION public.update_check_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.site_stats 
  SET total_checks = (SELECT COUNT(*) FROM public.card_checks),
      updated_at = now()
  WHERE id = 'global';
  RETURN NEW;
END;
$$;

-- Trigger to update check count on new check
CREATE TRIGGER on_check_created
  AFTER INSERT ON public.card_checks
  FOR EACH ROW EXECUTE FUNCTION public.update_check_count();

-- Enable realtime for stats table
ALTER PUBLICATION supabase_realtime ADD TABLE public.site_stats;