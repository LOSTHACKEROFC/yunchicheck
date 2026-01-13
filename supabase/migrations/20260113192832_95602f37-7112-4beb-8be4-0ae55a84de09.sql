-- Fix profiles table RLS policies
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

-- Create proper permissive policies for profiles (authenticated users only)
CREATE POLICY "Users can view their own profile" 
ON public.profiles 
FOR SELECT 
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile" 
ON public.profiles 
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile" 
ON public.profiles 
FOR UPDATE 
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Fix card_checks table RLS policies
DROP POLICY IF EXISTS "Users can view their own checks" ON public.card_checks;
DROP POLICY IF EXISTS "Users can insert their own checks" ON public.card_checks;

-- Create proper permissive policies for card_checks (authenticated users only)
CREATE POLICY "Users can view their own checks" 
ON public.card_checks 
FOR SELECT 
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own checks" 
ON public.card_checks 
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);