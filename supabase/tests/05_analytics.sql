-- Window: [now - 10 days, now + 1 day). Orders are placed through create_order, then their
-- created_at is moved (as postgres) to control which window they fall in.
do $$
declare
  s1 uuid := pg_temp.make_user('manager');
  s2 uuid := pg_temp.make_user('manager');
  own uuid := pg_temp.make_user('manager');
  adm uuid := pg_temp.make_user('admin');
  a uuid := pg_temp.make_product('AN-A', 100, 6000, 10000, 8000, 250);
  b uuid := pg_temp.make_product('AN-B', 100, 12000, 20000, 15000, 500);
  c uuid := pg_temp.make_product('AN-C', 5, 1000, 2000, 1500, 100);
  d uuid := pg_temp.make_product('AN-D', 5, 1000, 2000, 1500, 100);
  e uuid := pg_temp.make_product('AN-E', 0, 1000, 2000, 1500, 100);
  v_from timestamptz := date_trunc('day', now()) - interval '10 days';
  v_to timestamptz := now() + interval '1 day';
  one_a jsonb := jsonb_build_array(jsonb_build_object('product_id', a, 'qty', 1));
  o public.orders;
  r jsonb;
  v_first record;
  v_n int;
begin
  -- Keep real orders and products out of the window and the least-sold list (rolled back after).
  update public.orders set created_at = created_at - interval '5 years';
  update public.products set is_archived = true where barcode not like 'AN-%';
  update public.products set is_archived = true where id = d;

  perform pg_temp.login_as(s1);
  select * into o from public.create_order(gen_random_uuid(), jsonb_build_array(jsonb_build_object('product_id', a, 'qty', 2)), null, null, 'cash', 'store', null);
  select * into o from public.create_order(gen_random_uuid(), jsonb_build_array(jsonb_build_object('product_id', b, 'qty', 1)), null, null, 'card', 'store', null);
  select * into o from public.create_order(gen_random_uuid(), jsonb_build_array(jsonb_build_object('product_id', b, 'qty', 5)), null, null, 'cash', 'store', null);
  perform public.cancel_order(o.id);
  select * into o from public.create_order(gen_random_uuid(), one_a, '+821012345678', 'Ali', 'card', 'tekpe', 'UZ');
  perform pg_temp.logout();

  perform pg_temp.login_as(s2);
  select * into o from public.create_order(gen_random_uuid(), one_a, null, null, 'transfer', 'store', null);
  perform pg_temp.logout();
  update public.orders set created_at = v_from where id = o.id;          -- boundary: included
  perform pg_temp.login_as(s2);
  select * into o from public.create_order(gen_random_uuid(), one_a, null, null, 'cash', 'store', null);
  perform pg_temp.logout();
  update public.orders set created_at = v_to where id = o.id;            -- boundary: excluded

  -- manager, everyone
  perform pg_temp.login_as(own);
  r := public.analytics_report(v_from, v_to);
  assert (r ->> 'orders')::int = 4, 'orders ' || (r ->> 'orders');
  assert (r ->> 'items')::int = 5, 'items ' || (r ->> 'items');
  assert (r ->> 'revenue')::int = 60000, 'revenue ' || (r ->> 'revenue');
  assert (r ->> 'cost')::int = 36000, 'cost ' || (r ->> 'cost');
  assert (r ->> 'profit')::int = 24000, 'profit';
  assert (r ->> 'shipping_usd')::numeric = 10, 'shipping usd ' || (r ->> 'shipping_usd');
  assert (r ->> 'shipping_krw')::int = 0, 'shipping krw';
  select count(*) into v_n from jsonb_array_elements(r -> 'by_payment') x
    where (x ->> 'method' = 'cash' and (x ->> 'revenue')::int = 20000 and (x ->> 'orders')::int = 1)
       or (x ->> 'method' = 'card' and (x ->> 'revenue')::int = 30000 and (x ->> 'orders')::int = 2)
       or (x ->> 'method' = 'transfer' and (x ->> 'revenue')::int = 10000 and (x ->> 'orders')::int = 1);
  assert v_n = 3, 'payment breakdown';
  assert (r -> 'products' -> 0 ->> 'product_id')::uuid = a, 'products sorted by revenue';
  assert (r -> 'products' -> 0 ->> 'qty')::int = 4 and (r -> 'products' -> 0 ->> 'revenue')::int = 40000
     and (r -> 'products' -> 0 ->> 'cost')::int = 24000, 'product A totals';
  assert (r -> 'products' -> 1 ->> 'qty')::int = 1, 'cancelled B×5 excluded';

  r := public.analytics_report(v_from, v_to, s2);
  assert (r ->> 'revenue')::int = 10000, 'manager can scope to one seller';

  select * into v_first from public.least_sold(14) limit 1;
  assert v_first.product_id = c and v_first.qty_sold = 0, 'unsold product C comes first';
  select count(*) into v_n from public.least_sold(14) where product_id in (d, e);
  assert v_n = 0, 'archived and zero-stock products are not listed';
  perform pg_temp.logout();

  perform pg_temp.login_as(adm);
  perform pg_temp.expect_error(format('select public.analytics_report(%L, %L)', v_from, v_to), 'NOT_AUTHORIZED');
  perform pg_temp.expect_error('select * from public.least_sold(14)', 'NOT_AUTHORIZED');
  perform pg_temp.logout();
end $$;

-- a seller only ever sees their own numbers, whoever they ask for
do $$
declare
  s1 uuid := pg_temp.make_user('seller');
  s2 uuid := pg_temp.make_user('seller');
  m uuid := pg_temp.make_user('manager');
  a uuid := pg_temp.make_product('AS-A', 100, 6000, 10000, 8000, 250);
  o public.orders;
  r jsonb;
  v_n int;
  v_from timestamptz := now() - interval '1 hour';
  v_to timestamptz := now() + interval '1 hour';
begin
  update public.orders set created_at = created_at - interval '5 years';
  update public.app_secrets set telegram_enabled = false;
  perform pg_temp.login_as(s1);
  select * into o from public.submit_seller_order(gen_random_uuid(), jsonb_build_array(jsonb_build_object('product_id', a, 'qty', 3)), '+821012345678', 'Ali', 'Seul', 'Gangnam', 'cash', 'KR');
  perform pg_temp.logout();
  perform pg_temp.login_as(m);
  perform public.approve_order(o.id);
  perform pg_temp.logout();
  perform pg_temp.login_as(s2);
  select * into o from public.submit_seller_order(gen_random_uuid(), jsonb_build_array(jsonb_build_object('product_id', a, 'qty', 1)), '+821012345678', 'Ali', 'Seul', 'Gangnam', 'cash', 'KR');
  perform pg_temp.logout();
  perform pg_temp.login_as(m);
  perform public.approve_order(o.id);
  perform pg_temp.logout();

  perform pg_temp.login_as(s1);
  r := public.analytics_report(v_from, v_to, s2);
  assert (r ->> 'revenue')::int = 30000, 'seller asking for another seller gets own numbers: ' || (r ->> 'revenue');
  r := public.analytics_report(v_from, v_to);
  assert (r ->> 'revenue')::int = 30000, 'seller asking for everyone gets own numbers';
  select qty_sold into v_n from public.least_sold(14, s2) where product_id = a;
  assert v_n = 3, 'least_sold is scoped to the seller too: ' || v_n;
  perform pg_temp.logout();
end $$;
