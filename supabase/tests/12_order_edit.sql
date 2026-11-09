-- Managers can correct a finished order's client and payment method; items and stock never change.
do $$
declare
  m uuid := pg_temp.make_user('manager');
  s uuid := pg_temp.make_user('seller');
  p uuid := pg_temp.make_product('OE-1', 50, 6000, 10000, 8000, 300);
  one jsonb := jsonb_build_array(jsonb_build_object('product_id', p, 'qty', 1));
  o public.orders;
  t public.orders;
  v_name text;
  v_n int;
begin
  update public.app_settings set kr_shipping_krw = 4000, uz_shipping_usd_per_kg = 10;
  update public.app_secrets set telegram_enabled = false;
  perform pg_temp.login_as(m);

  -- store order: add a client, change the payment
  select * into o from public.create_order(gen_random_uuid(), one, null, null, 'cash', 'store', null);
  select * into o from public.update_order_info(o.id, '+821033334444', ' Malika ', 'card');
  assert o.customer_id is not null and o.payment_method = 'card', 'client added, payment changed';
  select name into v_name from public.customers where id = o.customer_id;
  assert v_name = 'Malika', 'new client created with the trimmed name';
  assert o.subtotal = 10000 and o.item_count = 1, 'items untouched';
  select stock into v_n from public.products where id = p;
  assert v_n = 49, 'stock untouched';

  -- rename the client; blank phone unlinks a store order
  select * into o from public.update_order_info(o.id, '+821033334444', 'Malika K.', 'card');
  select name into v_name from public.customers where id = o.customer_id;
  assert v_name = 'Malika K.', 'name belongs to the client';
  select * into o from public.update_order_info(o.id, '  ', null, 'cash');
  assert o.customer_id is null, 'blank phone unlinks the client';
  perform pg_temp.expect_error(format('select public.update_order_info(%L, ''010'', null, ''cash'')', o.id), 'INVALID_PHONE');

  -- Nasiya needs a client; switching to it makes the order owe its total
  perform pg_temp.expect_error(format('select public.update_order_info(%L, null, null, ''credit'')', o.id), 'NASIYA_NEEDS_CUSTOMER');
  select * into o from public.update_order_info(o.id, '+821033334444', 'Malika K.', 'credit');
  assert o.credit_due_krw = 10000, 'switching to Nasiya owes the total: ' || o.credit_due_krw;
  perform public.record_credit_payment(o.id, 3000);
  perform pg_temp.expect_error(format('select public.update_order_info(%L, ''+821033334444'', ''Malika K.'', ''cash'')', o.id), 'CREDIT_HAS_PAYMENTS');

  -- Tekpe keeps a client; cancelled orders are frozen
  select * into t from public.create_order(gen_random_uuid(), one, '+821055556666', 'Bobur', 'cash', 'tekpe', 'KR');
  perform pg_temp.expect_error(format('select public.update_order_info(%L, null, null, ''cash'')', t.id), 'TEKPE_NEEDS_CUSTOMER');
  select * into t from public.update_order_info(t.id, '+821055556666', 'Bobur aka', 'transfer');
  assert t.payment_method = 'transfer', 'Tekpe payment changed';
  perform public.cancel_order(t.id);
  perform pg_temp.expect_error(format('select public.update_order_info(%L, ''+821055556666'', ''Bobur'', ''cash'')', t.id), 'ORDER_CANCELLED');
  perform pg_temp.logout();

  -- managers only
  perform pg_temp.login_as(s);
  perform pg_temp.expect_error(format('select public.update_order_info(%L, null, null, ''cash'')', o.id), 'NOT_AUTHORIZED');
  perform pg_temp.logout();
end $$;
