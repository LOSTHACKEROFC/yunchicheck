INSERT INTO public.gateways (id, name, code, type, status, card_types, speed, success_rate, description, icon_name, icon_color, edge_function_name, charge_amount, cvc_required, display_order, is_active)
VALUES (
  'authnet_charge',
  'AuthNet Charge',
  'authnet_charge',
  'charge',
  'online',
  'Visa/MC',
  'Fast',
  '85%',
  'AuthNet Charge Gateway - $1.00 charge',
  'CreditCard',
  'text-green-500',
  'authnet-charge-check',
  '$1.00',
  true,
  101,
  true
);