-- Create topup transactions table
CREATE TABLE public.topup_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount >= 5),
  payment_method TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  wallet_address TEXT,
  transaction_hash TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.topup_transactions ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own topup transactions"
ON public.topup_transactions
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own topup transactions"
ON public.topup_transactions
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_topup_transactions_updated_at
BEFORE UPDATE ON public.topup_transactions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER TABLE public.topup_transactions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.topup_transactions;