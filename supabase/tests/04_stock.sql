do $$
declare
  v_mgr uuid := pg_temp.make_user('manager');
  v_admin uuid := pg_temp.make_user('admin');
  a uuid := pg_temp.make_product('ST-A', 0, 6000, 10000, 8000, 250);
  neg uuid := pg_temp.make_product('ST-NEG', -3, 1, 1, 1, 1);
  p public.products;
  v_n int;
begin
  perform pg_temp.login_as(v_mgr);
  select * into p from public.restock_product(a, 10, 6500);
  assert p.stock = 10 and p.cost_price = 6500, 'restock with cost';
  select count(*) into v_n from public.stock_movements where product_id = a and kind = 'restock' and qty_change = 10 and cost_price = 6500;
  assert v_n = 1, 'restock movement';
  select * into p from public.restock_product(a, 10);
  assert p.stock = 20 and p.cost_price = 6500, 'restock keeps cost';
  perform pg_temp.expect_error(format('select public.restock_product(%L::uuid, 0)', a), 'INVALID_QTY');
  select * into p from public.restock_product(a, 10);

  -- exact edit: optional expected value guards against overwriting other devices' changes
  select * into p from public.adjust_stock(a, 37);
  assert p.stock = 37, 'adjust sets stock';
  select count(*) into v_n from public.stock_movements where product_id = a and kind = 'adjust' and qty_change = 7;
  assert v_n = 1, 'adjust movement +7';
  perform public.adjust_stock(a, 37);
  select count(*) into v_n from public.stock_movements where product_id = a and kind = 'adjust';
  assert v_n = 1, 'no-op adjust writes no movement';
  perform pg_temp.expect_error(format('select public.adjust_stock(%L::uuid, 40, 30)', a), 'STOCK_CHANGED');
  select * into p from public.adjust_stock(a, 40, 37);
  assert p.stock = 40, 'adjust with matching expected value';
  perform pg_temp.expect_error(format('select public.adjust_stock(%L::uuid, -1)', a), 'INVALID_STOCK');
  perform pg_temp.expect_error(format('select public.adjust_stock(%L::uuid, 5)', gen_random_uuid()), 'PRODUCT_NOT_FOUND');

  -- stepper: relative change applied to the current value, never an overwrite
  perform pg_temp.logout();
  update public.products set stock = 35 where id = a;  -- another device sold 5 meanwhile
  perform pg_temp.login_as(v_mgr);
  select * into p from public.change_stock(a, 10);
  assert p.stock = 45, 'delta +10 applies to the current value: got ' || p.stock;
  select * into p from public.change_stock(a, -50);
  assert p.stock = 0, '−50 from 45 stops at 0';
  select * into p from public.change_stock(neg, -10);
  assert p.stock = -3, '−10 on oversold stock leaves it unchanged, never raises it';
  select count(*) into v_n from public.stock_movements where product_id = neg;
  assert v_n = 0, 'no-op change writes no movement';
  perform pg_temp.expect_error(format('select public.change_stock(%L::uuid, 0)', a), 'INVALID_QTY');
  perform pg_temp.logout();

  perform pg_temp.login_as(v_admin);
  perform pg_temp.expect_error(format('select public.restock_product(%L::uuid, 1)', a), 'NOT_AUTHORIZED');
  perform pg_temp.expect_error(format('select public.change_stock(%L::uuid, 1)', a), 'NOT_AUTHORIZED');
  perform pg_temp.logout();
end $$;
