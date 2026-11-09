-- Fixtures per block: A (retail 10000, wholesale 8000, cost 6000, 250 g),
--                     B (retail 20000, wholesale 15000, cost 12000, 500 g).
-- Items: A×2 retail + B×3 wholesale.

-- store order: totals, snapshots, stock, movements
do $$
declare
  v_mgr uuid := pg_temp.make_user('manager');
  a uuid := pg_temp.make_product('CO-A1', 5, 6000, 10000, 8000, 250);
  b uuid := pg_temp.make_product('CO-B1', 1, 12000, 20000, 15000, 500);
  items jsonb := jsonb_build_array(
    jsonb_build_object('product_id', a, 'qty', 2, 'is_wholesale', false),
    jsonb_build_object('product_id', b, 'qty', 3, 'is_wholesale', true));
  o public.orders;
  v_n int;
begin
  perform pg_temp.login_as(v_mgr);
  select * into o from public.create_order(gen_random_uuid(), items, null, null, 'cash', 'store', null);
  assert o.status = 'completed', 'store order completed';
  assert o.item_count = 5 and o.line_count = 2, 'counts';
  assert o.total_weight_g = 2000, 'weight';
  assert o.subtotal = 65000, 'subtotal ' || o.subtotal;
  assert o.cost_total = 48000, 'cost ' || o.cost_total;
  assert o.shipping_krw = 0 and o.shipping_usd = 0 and o.shipping_kg = 0, 'no shipping';
  assert o.seller_id = v_mgr, 'seller';
  assert o.customer_id is null, 'no customer';
  assert o.qr_token ~ '^[A-HJ-NP-Z2-9]{10}$', 'qr token format ' || o.qr_token;
  assert o.order_no > 0, 'order no';
  select stock into v_n from public.products where id = a; assert v_n = 3, 'A stock';
  select stock into v_n from public.products where id = b; assert v_n = -2, 'B stock may go negative';
  select count(*) into v_n from public.stock_movements where order_id = o.id and kind = 'sale'; assert v_n = 2, 'sale movements';
  select qty_change into v_n from public.stock_movements where order_id = o.id and product_id = b; assert v_n = -3, 'movement qty';
  select count(*) into v_n from public.order_items where order_id = o.id and unit_price = 15000 and is_wholesale and unit_cost = 12000
    and unit_weight_g = 500 and qty = 3 and line_total = 45000 and line_weight_g = 1500;
  assert v_n = 1, 'B line snapshot';
  perform pg_temp.logout();

  update public.products set retail_price = 99999 where id = a;
  select unit_price into v_n from public.order_items where order_id = o.id and product_id = a;
  assert v_n = 10000, 'order item keeps snapshot price';
end $$;

-- tekpe shipping, customers, idempotency, duplicate lines
do $$
declare
  v_mgr uuid := pg_temp.make_user('manager');
  a uuid := pg_temp.make_product('CO-A2', 50, 6000, 10000, 8000, 250);
  b uuid := pg_temp.make_product('CO-B2', 50, 12000, 20000, 15000, 500);
  items jsonb := jsonb_build_array(
    jsonb_build_object('product_id', a, 'qty', 2, 'is_wholesale', false),
    jsonb_build_object('product_id', b, 'qty', 3, 'is_wholesale', true));
  rid uuid := gen_random_uuid();
  o public.orders;
  o2 public.orders;
  v_n int;
  v_name text;
begin
  perform pg_temp.login_as(v_mgr);

  select * into o from public.create_order(gen_random_uuid(), items, '+821012345678', 'Dilnoza', 'card', 'tekpe', 'UZ');
  assert o.status = 'new', 'tekpe starts new';
  assert o.shipping_kg = 2 and o.shipping_usd = 20 and o.shipping_krw = 0, 'UZ shipping';
  assert o.customer_id is not null, 'customer linked';
  select name into v_name from public.customers where id = o.customer_id;
  assert v_name = 'Dilnoza', 'customer created';

  select * into o2 from public.create_order(gen_random_uuid(), items, '+821012345678', '  ', 'cash', 'store', null);
  assert o2.customer_id = o.customer_id, 'same customer';
  select name into v_name from public.customers where id = o.customer_id;
  assert v_name = 'Dilnoza', 'blank name keeps old name';

  select * into o2 from public.create_order(gen_random_uuid(), items, '+821012345678', 'Dilnoza K.', 'cash', 'tekpe', 'KR');
  assert o2.shipping_krw = 4000 and o2.shipping_usd = 0 and o2.shipping_kg = 0, 'KR shipping';
  select name into v_name from public.customers where id = o.customer_id;
  assert v_name = 'Dilnoza K.', 'new name renames';

  -- idempotency
  select stock into v_n from public.products where id = a;
  assert v_n = 44, 'A stock before retry ' || v_n;
  select * into o from public.create_order(rid, items, null, null, 'cash', 'store', null);
  select * into o2 from public.create_order(rid, items, null, null, 'cash', 'store', null);
  assert o.id = o2.id, 'same request id returns same order';
  select stock into v_n from public.products where id = a;
  assert v_n = 42, 'stock decremented once ' || v_n;
  select count(*) into v_n from public.orders where request_id = rid;
  assert v_n = 1, 'one order row';

  -- duplicate product lines are merged
  select * into o from public.create_order(gen_random_uuid(), jsonb_build_array(
    jsonb_build_object('product_id', a, 'qty', 1, 'is_wholesale', false),
    jsonb_build_object('product_id', a, 'qty', 2, 'is_wholesale', false)), null, null, 'cash', 'store', null);
  assert o.line_count = 1 and o.item_count = 3, 'duplicates merged';
  perform pg_temp.logout();
end $$;

-- validation and authorization
do $$
declare
  v_mgr uuid := pg_temp.make_user('manager');
  v_admin uuid := pg_temp.make_user('admin');
  v_inactive uuid := pg_temp.make_user('manager', false);
  a uuid := pg_temp.make_product('CO-A3', 5, 6000, 10000, 8000, 250);
  z uuid := pg_temp.make_product('CO-Z3', 5, 1, 1, 1, 1);
  ok text;
  call text := 'select public.create_order(gen_random_uuid(), %s, %s, %s, ''cash'', %L, %s)';
begin
  update public.products set is_archived = true where id = z;
  ok := format('jsonb_build_array(jsonb_build_object(''product_id'', %L::uuid, ''qty'', 1, ''is_wholesale'', false))', a);

  perform pg_temp.login_as(v_mgr);
  perform pg_temp.expect_error(format(call, ok, 'null', 'null', 'tekpe', 'null'), 'TEKPE_NEEDS_DESTINATION');
  perform pg_temp.expect_error(format(call, ok, 'null', '''Ali''', 'tekpe', '''KR'''), 'TEKPE_NEEDS_CUSTOMER');
  perform pg_temp.expect_error(format(call, ok, '''+821012345678''', ''' ''', 'tekpe', '''KR'''), 'TEKPE_NEEDS_CUSTOMER');
  perform pg_temp.expect_error(format(call, '''[]''::jsonb', 'null', 'null', 'store', 'null'), 'EMPTY_CART');
  perform pg_temp.expect_error(format(call,
    format('jsonb_build_array(jsonb_build_object(''product_id'', %L::uuid, ''qty'', 0))', a), 'null', 'null', 'store', 'null'), 'INVALID_QTY');
  perform pg_temp.expect_error(format(call,
    format('jsonb_build_array(jsonb_build_object(''product_id'', %L::uuid, ''qty'', 1.5))', a), 'null', 'null', 'store', 'null'), 'INVALID_QTY');
  perform pg_temp.expect_error(format(call, ok, '''010''', 'null', 'store', 'null'), 'INVALID_PHONE');
  perform pg_temp.expect_error(format(call,
    format('jsonb_build_array(jsonb_build_object(''product_id'', %L::uuid, ''qty'', 1))', z), 'null', 'null', 'store', 'null'), 'PRODUCT_NOT_FOUND');
  perform pg_temp.expect_error(format(call,
    format('jsonb_build_array(jsonb_build_object(''product_id'', %L::uuid, ''qty'', 1))', gen_random_uuid()), 'null', 'null', 'store', 'null'), 'PRODUCT_NOT_FOUND');
  perform pg_temp.logout();

  perform pg_temp.login_as(v_admin);
  perform pg_temp.expect_error(format(call, ok, 'null', 'null', 'store', 'null'), 'NOT_AUTHORIZED');
  perform pg_temp.logout();
  perform pg_temp.login_as(v_inactive);
  perform pg_temp.expect_error(format(call, ok, 'null', 'null', 'store', 'null'), 'NOT_AUTHORIZED');
  perform pg_temp.logout();
end $$;
