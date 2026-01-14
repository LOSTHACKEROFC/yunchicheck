-- Add rejection_reason column to topup_transactions table
ALTER TABLE public.topup_transactions
ADD COLUMN IF NOT EXISTS rejection_reason TEXT;