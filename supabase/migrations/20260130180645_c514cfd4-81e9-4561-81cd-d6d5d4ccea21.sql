-- Create a table to store gateway configurations
CREATE TABLE public.gateways (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT,
  type TEXT NOT NULL CHECK (type IN ('auth', 'preauth', 'charge')),
  status TEXT NOT NULL DEFAULT 'online' CHECK (status IN ('online', 'offline', 'unavailable')),
  card_types TEXT NOT NULL DEFAULT 'Visa/MC',
  speed TEXT NOT NULL DEFAULT 'Medium',
  success_rate TEXT NOT NULL DEFAULT '90%',
  description TEXT NOT NULL,
  icon_name TEXT NOT NULL DEFAULT 'CreditCard',
  icon_color TEXT NOT NULL DEFAULT 'text-blue-500',
  edge_function_name TEXT,
  charge_amount TEXT,
  cvc_required BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.gateways ENABLE ROW LEVEL SECURITY;

-- Everyone can read gateways (needed for the dashboard)
CREATE POLICY "Anyone can view active gateways"
ON public.gateways
FOR SELECT
TO authenticated
USING (is_active = true);

-- Only admins can insert gateways
CREATE POLICY "Admins can insert gateways"
ON public.gateways
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Only admins can update gateways
CREATE POLICY "Admins can update gateways"
ON public.gateways
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Only admins can delete gateways
CREATE POLICY "Admins can delete gateways"
ON public.gateways
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_gateways_updated_at
BEFORE UPDATE ON public.gateways
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for gateways table
ALTER PUBLICATION supabase_realtime ADD TABLE public.gateways;

-- Create a table to store pending gateway additions (for multi-step bot flow)
CREATE TABLE public.pending_gateway_additions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_chat_id TEXT NOT NULL,
  step TEXT NOT NULL DEFAULT 'name',
  gateway_id TEXT,
  gateway_name TEXT,
  gateway_code TEXT,
  gateway_type TEXT,
  card_types TEXT,
  speed TEXT,
  success_rate TEXT,
  description TEXT,
  icon_name TEXT,
  icon_color TEXT,
  edge_function_name TEXT,
  charge_amount TEXT,
  cvc_required BOOLEAN,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pending_gateway_additions ENABLE ROW LEVEL SECURITY;

-- Only service role can access this table (used by edge functions)
CREATE POLICY "Service role only for pending gateway additions"
ON public.pending_gateway_additions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Insert default gateways from the current hardcoded list
INSERT INTO public.gateways (id, name, code, type, status, card_types, speed, success_rate, description, icon_name, icon_color, edge_function_name, charge_amount, cvc_required, display_order) VALUES
('stripe_auth', 'YUNCHI AUTH 1', 'St', 'auth', 'online', 'Visa/MC/UnionPay/Diners/Maestro', '⚡ Blazing', '98%', '$0 Auth Check • CVC optional • No Amex/Discover/JCB', 'Sparkles', 'text-purple-500', 'stripe-auth-check', NULL, false, 1),
('combined_auth', 'YUNCHI AUTH 2', 'St+B3', 'auth', 'online', 'Visa/MC/Amex/Discover', '⚡⚡ Ultra', '99%', '$0 Auth Check • Parallel API (Stripe ↔ B3) • CVC optional', 'Zap', 'text-indigo-500', 'combined-auth-check', NULL, false, 2),
('braintree_auth', 'YUNCHI AUTH 3', 'B3', 'auth', 'online', 'Visa/MC/Discover', '⚡ Blazing', '96%', '$0 Auth Check • CVC optional (auto-handled if missing/000)', 'Wallet', 'text-blue-500', 'braintree-auth-check', NULL, false, 3),
('clover_charge', 'CLOVER CHARGE', NULL, 'charge', 'online', 'Visa/MC', 'Medium', '95%', '$0.50 Charge Verification • CVC required', 'Store', 'text-green-500', NULL, '$0.50', true, 4),
('square_charge', 'SQUARE CHARGE', NULL, 'charge', 'online', 'Visa/MC/Amex', 'Fast', '94%', '$0.50 Charge Verification • CVC required', 'CircleDollarSign', 'text-emerald-500', NULL, '$0.50', true, 5),
('shopify_charge', 'SHOPIFY CHARGE', NULL, 'charge', 'online', 'Visa/MC/Amex/Discover', 'Medium', '93%', '$1.00 Charge Verification • CVC required', 'ShoppingBag', 'text-lime-500', NULL, '$1.00', true, 6),
('stripe_charge', 'STRIPE CHARGE', 'StC', 'charge', 'online', 'Visa/MC/Amex', 'Fast', '85%', '$10.00 Charge • CVC required', 'Zap', 'text-violet-500', 'stripe-charge-check', '$10.00', true, 7),
('paygate_charge', 'PAYGATE', NULL, 'charge', 'online', 'Visa/MC/Amex', 'Medium', '40%', '$14.00 Charged • CVC required', 'CreditCard', 'text-cyan-500', 'paygate-check', '$14.00', true, 8),
('payu_charge', 'PayU', 'PayU', 'charge', 'online', 'Visa/MC/RuPay', '⚡ Blazing', '85%', '₹1-₹500 Custom Charge • CVC required', 'Zap', 'text-orange-500', 'payu-check', 'custom', true, 9);

-- Migrate existing gateway_status data to gateways table
UPDATE public.gateways g
SET status = gs.status
FROM public.gateway_status gs
WHERE g.id = gs.id;