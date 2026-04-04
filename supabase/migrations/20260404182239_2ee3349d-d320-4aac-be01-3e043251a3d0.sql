UPDATE public.gateways SET name = 'Adyenauth-check', code = 'Adyen1' WHERE id = 'stripe_auth';
UPDATE public.gateways SET code = 'Adyen' WHERE id = 'combined_auth' AND code = 'Adyen';