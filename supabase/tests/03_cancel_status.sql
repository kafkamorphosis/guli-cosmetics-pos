do $$
declare
  v_mgr uuid := pg_temp.make_user('manager');
  a uuid := pg_temp.make_product('CS-A', 5, 6000, 10000, 8000, 250);
  b uuid := pg_temp.make_product('CS-B', 1, 12000, 20000, 15000, 500);
  items jsonb := jsonb_build_array(
    jsonb_build_object('product_id', a, 'qty', 2, 'is_wholesale', false),
    jsonb_build_object('product_id', b, 'qty', 3, 'is_wholesale', true));
  o public.orders;
  t public.orders;
  v_n int;
begin
  perform pg_temp.login_as(v_mgr);

  -- cancel restores stock exactly once
  select * into o from public.create_order(gen_random_uuid(), items, null, null, 'cash', 'store', null);
  select * into o from public.cancel_order(o.id);
  assert o.status = 'cancelled' and o.cancelled_by = v_mgr and o.cancelled_at is not null, 'cancelled';
  select stock into v_n from public.products where id = a; assert v_n = 5, 'A restored';
  select stock into v_n from public.products where id = b; assert v_n = 1, 'B restored';
  select count(*) into v_n from public.stock_movements where order_id = o.id and kind = 'cancel'; assert v_n = 2, 'cancel movements';
  perform pg_temp.expect_error(format('select public.cancel_order(%L::uuid)', o.id), 'ORDER_ALREADY_CANCELLED');
  select stock into v_n from public.products where id = a; assert v_n = 5, 'A not restored twice';
  perform pg_temp.expect_error(format('select public.cancel_order(%L::uuid)', gen_random_uuid()), 'ORDER_NOT_FOUND');

  -- tekpe status flow
  select * into t from public.create_order(gen_random_uuid(), items, '+821012345678', 'Ali', 'cash', 'tekpe', 'KR');
  perform pg_temp.expect_error(format('select public.set_order_status(%L::uuid, ''picked_up'')', t.id), 'INVALID_STATUS_TRANSITION');
  select * into t from public.set_order_status(t.id, 'ready');
  assert t.status = 'ready' and t.ready_by = v_mgr and t.ready_at is not null, 'ready';
  perform pg_temp.expect_error(format('select public.set_order_status(%L::uuid, ''ready'')', t.id), 'INVALID_STATUS_TRANSITION');
  select * into t from public.set_order_status(t.id, 'picked_up');
  assert t.status = 'picked_up' and t.picked_up_by = v_mgr and t.picked_up_at is not null, 'picked up';

  -- store orders and cancelled orders can't move
  select * into o from public.create_order(gen_random_uuid(), items, null, null, 'cash', 'store', null);
  perform pg_temp.expect_error(format('select public.set_order_status(%L::uuid, ''ready'')', o.id), 'INVALID_STATUS_TRANSITION');
  select * into t from public.create_order(gen_random_uuid(), items, '+821012345678', 'Ali', 'cash', 'tekpe', 'UZ');
  perform public.cancel_order(t.id);
  perform pg_temp.expect_error(format('select public.set_order_status(%L::uuid, ''ready'')', t.id), 'INVALID_STATUS_TRANSITION');
  perform pg_temp.expect_error(format('select public.set_order_status(%L::uuid, ''ready'')', gen_random_uuid()), 'ORDER_NOT_FOUND');
  perform pg_temp.logout();
end $$;
