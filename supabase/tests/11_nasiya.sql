-- Nasiya: credit sales need a known client; managers record payments until nothing is left.
do $$
declare
  m uuid := pg_temp.make_user('manager');
  s uuid := pg_temp.make_user('seller');
  s2 uuid := pg_temp.make_user('seller');
  p uuid := pg_temp.make_product('NS-1', 50, 6000, 10000, 8000, 300);
  two jsonb := jsonb_build_array(jsonb_build_object('product_id', p, 'qty', 2));
  o public.orders;
  t public.orders;
  so public.orders;
  v_n int;
  j jsonb;
begin
  update public.app_settings set kr_shipping_krw = 4000, uz_shipping_usd_per_kg = 10;
  update public.app_secrets set telegram_enabled = false;

  perform pg_temp.login_as(m);
  perform pg_temp.expect_error(format('select public.create_order(gen_random_uuid(), %L::jsonb, null, null, ''credit'', ''store'', null)', two), 'NASIYA_NEEDS_CUSTOMER');
  perform pg_temp.expect_error(format('select public.create_order(gen_random_uuid(), %L::jsonb, ''+821099990000'', null, ''credit'', ''store'', null)', two), 'NASIYA_NEEDS_CUSTOMER');
  select * into o from public.create_order(gen_random_uuid(), two, '+821099990000', 'Nodira', 'credit', 'store', null);
  assert o.payment_method = 'credit' and o.paid_krw = 0 and o.credit_due_krw = 20000, 'new Nasiya order owes its total: ' || o.credit_due_krw;
  select * into t from public.create_order(gen_random_uuid(), two, '+821099990000', 'Nodira', 'credit', 'tekpe', 'KR');
  assert t.credit_due_krw = 24000, 'Korean shipping is part of the debt';
  select * into t from public.create_order(gen_random_uuid(), two, null, null, 'cash', 'store', null);
  assert t.credit_due_krw = 0, 'other methods owe nothing';

  -- payments
  perform pg_temp.expect_error(format('select public.record_credit_payment(%L, 0)', o.id), 'INVALID_AMOUNT');
  perform pg_temp.expect_error(format('select public.record_credit_payment(%L, 20001)', o.id), 'CREDIT_OVERPAY');
  perform pg_temp.expect_error(format('select public.record_credit_payment(%L, 100)', t.id), 'NOT_CREDIT');
  select * into o from public.record_credit_payment(o.id, 15000);
  assert o.paid_krw = 15000 and o.credit_due_krw = 5000, 'part paid';
  select * into o from public.record_credit_payment(o.id, 5000);
  assert o.credit_due_krw = 0, 'paid off';
  perform pg_temp.expect_error(format('select public.record_credit_payment(%L, 1)', o.id), 'CREDIT_OVERPAY');
  select count(*) into v_n from public.credit_payments where order_id = o.id and recorded_by = m;
  assert v_n = 2, 'two payments recorded';

  -- cancelled orders owe nothing and take no payments
  select * into t from public.create_order(gen_random_uuid(), two, '+821099990000', 'Nodira', 'credit', 'store', null);
  select * into t from public.cancel_order(t.id);
  assert t.credit_due_krw = 0, 'cancelled Nasiya order owes nothing';
  perform pg_temp.expect_error(format('select public.record_credit_payment(%L, 100)', t.id), 'INVALID_STATUS_TRANSITION');
  perform pg_temp.logout();

  -- sellers: Nasiya needs the client like any seller order; payments only after approval, by managers
  perform pg_temp.login_as(s);
  select * into so from public.submit_seller_order(gen_random_uuid(), two, '+821077776666', 'Zuhra', 'Seul', 'Mapo', 'credit', 'KR');
  assert so.payment_method = 'credit' and so.credit_due_krw = 20000, 'seller Nasiya owes goods only (shipping is on the box)';
  perform pg_temp.expect_error(format('select public.record_credit_payment(%L, 100)', so.id), 'NOT_AUTHORIZED');
  select count(*) into v_n from public.credit_payments;
  assert v_n = 0, 'sellers cannot read payments';
  perform pg_temp.logout();

  perform pg_temp.login_as(m);
  perform pg_temp.expect_error(format('select public.record_credit_payment(%L, 100)', so.id), 'INVALID_STATUS_TRANSITION');
  perform public.approve_order(so.id);
  perform public.record_credit_payment(so.id, 8000);
  perform pg_temp.logout();

  perform pg_temp.login_as(s);
  j := public.my_order(so.id);
  assert (j ->> 'paid_krw')::int = 8000 and (j ->> 'credit_due_krw')::int = 12000, 'seller sees paid and left: ' || j::text;
  perform pg_temp.logout();
  perform pg_temp.login_as(s2);
  assert public.my_order(so.id) is null, 'other sellers see nothing';
  perform pg_temp.logout();
end $$;
