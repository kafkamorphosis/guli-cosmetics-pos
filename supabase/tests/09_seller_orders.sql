-- Seller orders: submitted as pending (no stock), approved by a manager (stock deducted once).
do $$
declare
  s uuid := pg_temp.make_user('seller');
  s2 uuid := pg_temp.make_user('seller');
  m uuid := pg_temp.make_user('manager');
  p uuid := pg_temp.make_product('SO-1', 10, 6000, 10000, 8000, 600);
  two jsonb := jsonb_build_array(jsonb_build_object('product_id', p, 'qty', 2));
  one jsonb := jsonb_build_array(jsonb_build_object('product_id', p, 'qty', 1));
  r1 uuid := gen_random_uuid();
  o public.orders;
  o2 public.orders;
  o3 public.orders;
  o4 public.orders;
  v_n int;
  v_text text;
  j jsonb;
begin
  update public.app_settings set kr_shipping_krw = 4000, uz_shipping_usd_per_kg = 10;
  update public.app_secrets set telegram_enabled = false;
  delete from public.notification_log;

  -- submit
  perform pg_temp.login_as(s);
  select * into o from public.submit_seller_order(r1, two, '+821012345678', 'Ali', 'Seul', 'Gangnam', 'card', 'UZ');
  assert o.status = 'pending' and o.type = 'tekpe' and o.destination = 'UZ', 'pending tekpe order';
  assert o.seller_id = s, 'seller recorded';
  assert o.subtotal = 20000 and o.item_count = 2 and o.shipping_kg = 0 and o.shipping_usd = 0, 'snapshot totals; shipping goes on the box';
  select * into o2 from public.submit_seller_order(r1, two, '+821012345678', 'Ali', 'Seul', 'Gangnam', 'card', 'UZ');
  assert o2.id = o.id, 'same request id returns the same order';
  perform pg_temp.expect_error(format('select public.submit_seller_order(gen_random_uuid(), %L::jsonb, ''+821012345678'', '' '', ''Seul'', ''Gangnam'', ''cash'', ''KR'')', one), 'TEKPE_NEEDS_CUSTOMER');
  perform pg_temp.expect_error(format('select public.submit_seller_order(gen_random_uuid(), %L::jsonb, ''+821012345678'', ''Ali'', ''Seul'', ''Gangnam'', ''cash'', null)', one), 'TEKPE_NEEDS_DESTINATION');
  perform pg_temp.expect_error(format('select public.approve_order(%L)', o.id), 'NOT_AUTHORIZED');
  perform pg_temp.logout();

  select stock into v_n from public.products where id = p;
  assert v_n = 10, 'submit holds no stock: ' || v_n;
  select count(*) into v_n from public.stock_movements where order_id = o.id;
  assert v_n = 0, 'submit writes no stock movements';
  select count(*) into v_n from public.orders where request_id = r1;
  assert v_n = 1, 'one order row for the request';
  select text into v_text from public.notification_log where kind = 'tekpe_order';
  assert position('Tasdiqlash kerak' in v_text) > 0 and position('Test seller' in v_text) > 0, 'alert asks for approval: ' || v_text;

  -- approve
  perform pg_temp.login_as(m);
  perform pg_temp.expect_error(format('select public.submit_seller_order(gen_random_uuid(), %L::jsonb, ''+821012345678'', ''Ali'', ''Seul'', ''Gangnam'', ''cash'', ''KR'')', one), 'NOT_AUTHORIZED');
  select * into o from public.approve_order(o.id);
  assert o.status = 'new' and o.approved_by = m and o.approved_at is not null, 'approved';
  perform pg_temp.expect_error(format('select public.approve_order(%L)', o.id), 'INVALID_STATUS_TRANSITION');
  perform pg_temp.expect_error(format('select public.approve_order(%L)', gen_random_uuid()), 'ORDER_NOT_FOUND');
  perform pg_temp.logout();
  select stock into v_n from public.products where id = p;
  assert v_n = 8, 'approval deducts stock once: ' || v_n;
  select count(*) into v_n from public.stock_movements where order_id = o.id and kind = 'sale' and qty_change = -2;
  assert v_n = 1, 'one sale movement';

  -- price snapshot survives a price change; an archived product blocks approval
  perform pg_temp.login_as(s);
  select * into o2 from public.submit_seller_order(gen_random_uuid(), one, '+821012345678', 'Ali', 'Seul', 'Gangnam', 'cash', 'KR');
  select * into o3 from public.submit_seller_order(gen_random_uuid(), one, '+821012345678', 'Ali', 'Seul', 'Gangnam', 'cash', 'KR');
  select * into o4 from public.submit_seller_order(gen_random_uuid(), one, '+821012345678', 'Ali', 'Seul', 'Gangnam', 'cash', 'KR');
  perform pg_temp.logout();
  update public.products set retail_price = 99999 where id = p;
  perform pg_temp.login_as(m);
  select * into o2 from public.approve_order(o2.id);
  assert o2.subtotal = 10000 and o2.shipping_krw = 0, 'approval keeps the seller''s prices';
  perform public.cancel_order(o4.id);
  perform pg_temp.logout();
  select stock into v_n from public.products where id = p;
  assert v_n = 7, 'rejecting a pending order returns nothing: ' || v_n;
  update public.products set is_archived = true where id = p;
  perform pg_temp.login_as(m);
  perform pg_temp.expect_error(format('select public.approve_order(%L)', o3.id), 'PRODUCT_NOT_FOUND');
  perform pg_temp.logout();
  select status::text into v_text from public.orders where id = o3.id;
  assert v_text = 'pending', 'failed approval leaves the order pending';
  update public.products set is_archived = false where id = p;

  -- pending orders count nowhere; sellers never see cost
  perform pg_temp.login_as(m);
  j := public.analytics_report(now() - interval '1 hour', now() + interval '1 hour', s);
  assert (j ->> 'orders')::int = 2, 'manager report counts the two approved orders: ' || (j ->> 'orders');
  assert (j ->> 'cost')::int = 18000, 'manager sees cost';
  select orders into v_n from public.customer_stats(s) where id = o.customer_id;
  assert v_n = 2, 'client totals exclude pending: ' || v_n;
  perform pg_temp.logout();

  perform pg_temp.login_as(s);
  j := public.analytics_report(now() - interval '1 hour', now() + interval '1 hour');
  assert (j ->> 'orders')::int = 2 and (j ->> 'revenue')::int = 30000, 'seller report: own approved orders';
  assert j -> 'cost' = 'null'::jsonb and j -> 'profit' = 'null'::jsonb, 'seller report has no cost or profit';
  assert not (j -> 'products' -> 0 ? 'cost'), 'seller product rows have no cost';
  select count(*) into v_n from public.seller_catalog('SO-1') c where to_jsonb(c) ? 'cost_price';
  assert v_n = 0, 'catalog has no cost column';
  select count(*) into v_n from public.seller_catalog('product so-1');
  assert v_n = 1, 'catalog searches names without case';
  select count(*) into v_n from public.seller_catalog('product so-1', 60, 1);
  assert v_n = 0, 'catalog pages with an offset';
  j := public.my_orders(2, 2);
  assert jsonb_array_length(j) = 2, 'my_orders pages with an offset';
  j := public.my_orders();
  assert jsonb_array_length(j) = 4, 'seller sees their four orders: ' || jsonb_array_length(j);
  assert not exists (select 1 from jsonb_array_elements(j) e where e ? 'cost_total'), 'my_orders has no cost';
  j := public.my_order(o.id);
  assert (j ->> 'order_no')::bigint = o.order_no and jsonb_array_length(j -> 'items') = 1, 'my_order with items';
  assert not (j -> 'items' -> 0 ? 'unit_cost'), 'items have no cost';
  assert (public.my_order(null, r1) ->> 'id')::uuid = o.id, 'lookup by request id';
  perform pg_temp.logout();

  perform pg_temp.login_as(s2);
  assert public.my_order(o.id) is null, 'another seller''s order is not visible';
  assert jsonb_array_length(public.my_orders()) = 0, 'another seller has no orders';
  perform pg_temp.logout();
end $$;
