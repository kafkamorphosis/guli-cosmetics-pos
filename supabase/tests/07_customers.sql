-- Mijozlar: per-client totals, scoped like Statistika (seller → own sales, manager → all or one seller).
do $$
declare
  s1 uuid := pg_temp.make_user('manager');
  s2 uuid := pg_temp.make_user('manager');
  own uuid := pg_temp.make_user('manager');
  adm uuid := pg_temp.make_user('admin');
  a uuid := pg_temp.make_product('CU-A', 100, 6000, 10000, 8000, 1500);
  one_a jsonb := jsonb_build_array(jsonb_build_object('product_id', a, 'qty', 1));
  two_a jsonb := jsonb_build_array(jsonb_build_object('product_id', a, 'qty', 2));
  ali uuid;
  vali uuid;
  o public.orders;
  r record;
  v_n int;
begin
  update public.app_settings set kr_shipping_krw = 4000, uz_shipping_usd_per_kg = 10;
  update public.app_secrets set telegram_enabled = false;
  perform pg_temp.login_as(s1);
  select * into o from public.create_order(gen_random_uuid(), two_a, '+821011110000', 'Ali', 'cash', 'store', null);
  ali := o.customer_id;
  select * into o from public.create_order(gen_random_uuid(), one_a, '+821011110000', 'Ali', 'card', 'tekpe', 'UZ');  -- 2 kg → 20 $
  select * into o from public.create_order(gen_random_uuid(), one_a, '+821011110000', null, 'cash', 'store', null);
  perform public.cancel_order(o.id);
  perform pg_temp.logout();

  perform pg_temp.login_as(s2);
  select * into o from public.create_order(gen_random_uuid(), one_a, '+998901112233', 'Vali', 'cash', 'store', null);
  vali := o.customer_id;
  perform public.create_order(gen_random_uuid(), one_a, '+821011110000', 'Ali', 'transfer', 'tekpe', 'KR');  -- +4 000 ₩
  perform pg_temp.logout();

  -- manager, everyone
  perform pg_temp.login_as(own);
  select * into r from public.customer_stats() where id = ali;
  assert r.orders = 3, 'Ali orders (cancelled excluded): ' || r.orders;
  assert r.items = 4, 'Ali items: ' || r.items;
  assert r.spent = 44000, 'Ali spent = 40 000 goods + 4 000 shipping: ' || r.spent;
  assert r.shipping_usd = 20, 'Ali shipping usd: ' || r.shipping_usd;
  assert r.tekpe_orders = 2, 'Ali tekpe orders: ' || r.tekpe_orders;
  assert r.name = 'Ali' and r.phone = '+821011110000', 'Ali identity';
  assert r.last_order_at is not null, 'last order time';
  select count(*) into v_n from public.customer_stats();
  assert v_n >= 2, 'manager sees all clients';

  select * into r from public.customer_stats(s2) where id = ali;
  assert r.orders = 1 and r.spent = 14000, 'manager scoped to s2: ' || r.orders || ' / ' || r.spent;
  select count(*) into v_n from public.customer_stats(s1) where id = vali;
  assert v_n = 0, 'clients without orders from the seller are left out';
  select count(*) into v_n from public.customer_stats(null, vali);
  assert v_n = 1, 'one client by id';

  perform public.rename_customer(vali, '  Vali aka  ');
  select name into r from public.customers where id = vali;
  assert r.name = 'Vali aka', 'rename trims: ' || r.name;
  perform public.rename_customer(vali, '   ');
  select name into r from public.customers where id = vali;
  assert r.name is null, 'blank name clears it';
  perform pg_temp.logout();

  perform pg_temp.login_as(own);
  perform pg_temp.expect_error(format('select public.rename_customer(%L, %L)', ali, repeat('x', 121)), 'NAME_TOO_LONG');
  perform pg_temp.logout();

  perform pg_temp.login_as(adm);
  perform pg_temp.expect_error('select * from public.customer_stats()', 'NOT_AUTHORIZED');
  perform pg_temp.expect_error(format('select public.rename_customer(%L, %L)', ali, 'X'), 'NOT_AUTHORIZED');
  perform pg_temp.logout();
end $$;

-- a seller only ever sees their own clients and numbers
do $$
declare
  s1 uuid := pg_temp.make_user('seller');
  s2 uuid := pg_temp.make_user('seller');
  m uuid := pg_temp.make_user('manager');
  a uuid := pg_temp.make_product('CS-1', 100, 6000, 10000, 8000, 500);
  one jsonb := jsonb_build_array(jsonb_build_object('product_id', a, 'qty', 1));
  o public.orders;
  ali uuid;
  vali uuid;
  r record;
  v_n int;
begin
  update public.app_settings set kr_shipping_krw = 4000, uz_shipping_usd_per_kg = 10;
  update public.app_secrets set telegram_enabled = false;
  perform pg_temp.login_as(s1);
  select * into o from public.submit_seller_order(gen_random_uuid(), one, '+821077770000', 'Ali', 'Seul', 'Gangnam', 'cash', 'KR');
  ali := o.customer_id;
  perform pg_temp.logout();
  perform pg_temp.login_as(m);
  perform public.approve_order(o.id);
  perform pg_temp.logout();
  perform pg_temp.login_as(s2);
  select * into o from public.submit_seller_order(gen_random_uuid(), one, '+998907770000', 'Vali', 'Seul', 'Gangnam', 'cash', 'KR');
  vali := o.customer_id;
  perform pg_temp.logout();
  perform pg_temp.login_as(m);
  perform public.approve_order(o.id);
  perform pg_temp.logout();

  perform pg_temp.login_as(s1);
  select * into r from public.customer_stats(s2) where id = ali;
  assert r.orders = 1 and r.spent = 10000, 'seller asking for another seller gets own numbers: ' || r.orders || ' / ' || r.spent;
  select count(*) into v_n from public.customer_stats() where id = vali;
  assert v_n = 0, 'seller does not see other sellers'' clients';
  perform pg_temp.expect_error(format('select public.rename_customer(%L, %L)', ali, 'X'), 'NOT_AUTHORIZED');
  perform pg_temp.logout();
end $$;
