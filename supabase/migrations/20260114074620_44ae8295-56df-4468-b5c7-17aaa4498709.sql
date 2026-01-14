-- Create enum for roles
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Users can view their own roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
USING (auth.uid() = user_id);

-- Create security definer function to check roles (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Drop existing overly permissive policies on support_tickets
DROP POLICY IF EXISTS "Service role can update tickets" ON public.support_tickets;

-- Create admin-only update policy for support_tickets
CREATE POLICY "Admins can update tickets"
ON public.support_tickets
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Drop existing overly permissive insert policy on ticket_messages for admin messages
DROP POLICY IF EXISTS "Service role can insert admin messages" ON public.ticket_messages;

-- Create admin-only insert policy for admin messages
CREATE POLICY "Admins can insert admin messages"
ON public.ticket_messages
FOR INSERT
WITH CHECK (
  public.has_role(auth.uid(), 'admin') AND is_admin = true
);

-- Create index for faster role lookups
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);