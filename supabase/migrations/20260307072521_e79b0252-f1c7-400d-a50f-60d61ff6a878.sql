
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, username, credits)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'username', 100);
  RETURN NEW;
END;
$function$;
