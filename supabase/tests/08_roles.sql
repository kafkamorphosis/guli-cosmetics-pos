-- Roles: root (admin) keeps the console, managers run the store, sellers only reach their own RPCs.
do $$
declare
  mgr uuid := pg_temp.make_user('manager');
  sel uuid := pg_temp.make_user('seller');
  off uuid := pg_temp.make_user('seller', false);
  promoted uuid := pg_temp.make_user('seller');
  p uuid := pg_temp.make_product('RO-1', 5, 1000, 2000, 1500, 100);
  one jsonb := jsonb_build_array(jsonb_build_object('product_id', p, 'qty', 1));
  o public.orders;
  v_role public.app_role;
  v_active boolean;
  v_n int;
  v_cost bigint;
begin
  select role, is_active into v_role, v_active from public.profiles where id = mgr;
  assert v_role = 'manager' and v_active, 'manager accounts are created active';

  update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"manager"}' where id = promoted;
  select role into v_role from public.profiles where id = promoted;
  assert v_role = 'manager', 'promoting a seller in app_metadata updates the profile';

  perform pg_temp.login_as(mgr);
  select * into o from public.create_order(gen_random_uuid(), one, '+821055556666', 'Mijoz', 'cash', 'store', null);
  select count(*) into v_n from public.products where id = p;
  assert v_n = 1, 'manager sees products';
  perform pg_temp.logout();

  perform pg_temp.login_as(sel);
  select count(*) into v_n from public.products;
  assert v_n = 0, 'seller cannot read products directly';
  select count(*) into v_n from public.customers;
  assert v_n = 0, 'seller cannot read customers';
  select count(*) into v_n from public.orders;
  assert v_n = 0, 'seller cannot read orders';
  select count(*) into v_n from public.order_items;
  assert v_n = 0, 'seller cannot read order items';
  select count(*) into v_n from public.stock_movements;
  assert v_n = 0, 'seller cannot read stock movements';
  select cost_value into v_cost from public.inventory_summary;
  assert v_cost = 0, 'seller gets no inventory value';
  perform pg_temp.expect_error(format('select public.create_order(gen_random_uuid(), %L::jsonb, null, null, ''cash'', ''store'', null)', one), 'NOT_AUTHORIZED');
  perform pg_temp.expect_error(format('select public.restock_product(%L, 1)', p), 'NOT_AUTHORIZED');
  perform pg_temp.expect_error(format('select public.adjust_stock(%L, 3)', p), 'NOT_AUTHORIZED');
  perform pg_temp.expect_error(format('select public.change_stock(%L, 1)', p), 'NOT_AUTHORIZED');
  perform pg_temp.expect_error(format('select public.set_order_status(%L, ''ready'')', o.id), 'NOT_AUTHORIZED');
  perform pg_temp.expect_error(format('select public.cancel_order(%L)', o.id), 'NOT_AUTHORIZED');
  perform pg_temp.expect_error(format('select public.rename_customer(%L, ''X'')', o.customer_id), 'NOT_AUTHORIZED');
  perform pg_temp.logout();

  perform pg_temp.login_as(off);
  perform pg_temp.expect_error('select public.analytics_report(now() - interval ''1 day'', now())', 'NOT_AUTHORIZED');
  perform pg_temp.logout();
end $$;
