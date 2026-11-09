-- Nasiya (installment) payment method. On its own so the value is committed before migration 016
-- uses it; harmless for the running app.
alter type public.payment_method add value if not exists 'credit';
