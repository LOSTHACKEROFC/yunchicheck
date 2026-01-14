-- Add admin policies for topup transactions
CREATE POLICY "Admins can view all topup transactions"
ON public.topup_transactions
FOR SELECT
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update topup transactions"
ON public.topup_transactions
FOR UPDATE
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Create function to update balance when topup is completed
CREATE OR REPLACE FUNCTION public.handle_topup_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only trigger when status changes to 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    -- Update user balance
    UPDATE public.profiles
    SET balance = balance + NEW.amount
    WHERE user_id = NEW.user_id;
    
    -- Set completed_at timestamp
    NEW.completed_at = now();
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for topup completion
CREATE TRIGGER on_topup_status_change
BEFORE UPDATE ON public.topup_transactions
FOR EACH ROW
EXECUTE FUNCTION public.handle_topup_completion();