-- Add name and Telegram fields to profiles table
ALTER TABLE public.profiles 
ADD COLUMN name text,
ADD COLUMN telegram_chat_id text,
ADD COLUMN telegram_username text;