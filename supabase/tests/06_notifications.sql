-- low_stock_products view
do $$
declare
  v_mgr uuid := pg_temp.make_user('manager');
  v_admin uuid := pg_temp.make_user('admin');
  low uuid := pg_temp.make_product('NT-LOW', 9, 1, 1, 1, 1);
  ok uuid := pg_temp.make_product('NT-OK', 11, 1, 1, 1, 1);
  arch uuid := pg_temp.make_product('NT-ARCH', 1, 1, 1, 1, 1);
  v_n int;
begin
  update public.products set is_archived = true where id = arch;
  perform pg_temp.login_as(v_mgr);
  select count(*) into v_n from public.low_stock_products where id = low;
  assert v_n = 1, 'stock 9 / threshold 10 is low';
  select count(*) into v_n from public.low_stock_products where id in (ok, arch);
  assert v_n = 0, 'stock above threshold and archived products are not listed';
  perform pg_temp.logout();
  perform pg_temp.login_as(v_admin);
  select count(*) into v_n from public.low_stock_products;
  assert v_n = 0, 'admin sees nothing';
  perform pg_temp.logout();
end $$;

-- telegram: alerts are logged once per threshold crossing (sending is off in tests)
do $$
declare
  v_mgr uuid := pg_temp.make_user('manager');
  v_admin uuid := pg_temp.make_user('admin');
  p uuid := pg_temp.make_product('TG-1', 11, 1000, 2000, 1500, 100);
  one jsonb := jsonb_build_array(jsonb_build_object('product_id', p, 'qty', 1));
  two jsonb := jsonb_build_array(jsonb_build_object('product_id', p, 'qty', 2));
  o public.orders;
  v_n int;
  v_text text;
begin
  update public.app_secrets set telegram_enabled = false;
  delete from public.notification_log;

  perform pg_temp.login_as(v_mgr);
  perform public.create_order(gen_random_uuid(), two, null, null, 'cash', 'store', null);   -- 11 → 9: crosses
  perform public.create_order(gen_random_uuid(), one, null, null, 'cash', 'store', null);   -- 9 → 8: already low
  perform pg_temp.logout();
  select count(*) into v_n from public.notification_log where kind = 'low_stock';
  assert v_n = 1, 'one low-stock alert per crossing, got ' || v_n;
  select text into v_text from public.notification_log where kind = 'low_stock';
  assert position('Product TG-1' in v_text) > 0 and position('9 ta' in v_text) > 0, 'alert names the product and stock: ' || v_text;

  perform pg_temp.login_as(v_mgr);
  perform public.restock_product(p, 7);                                                       -- 8 → 15
  perform public.create_order(gen_random_uuid(), jsonb_build_array(jsonb_build_object('product_id', p, 'qty', 5)), null, null, 'cash', 'store', null);  -- 15 → 10: crosses again
  select * into o from public.create_order(gen_random_uuid(), one, '+821000000001', '<Ali & Co>', 'card', 'tekpe', 'UZ');
  perform public.create_order(gen_random_uuid(), one, null, null, 'cash', 'store', null);
  perform pg_temp.logout();
  select count(*) into v_n from public.notification_log where kind = 'low_stock';
  assert v_n = 2, 'second crossing after restock alerts again, got ' || v_n;
  select count(*) into v_n from public.notification_log where kind = 'tekpe_order';
  assert v_n = 1, 'one tekpe alert, store orders none, got ' || v_n;
  select text into v_text from public.notification_log where kind = 'tekpe_order';
  assert position(lpad(o.order_no::text, 6, '0') in v_text) > 0, 'tekpe alert has the order number: ' || v_text;
  assert position('&lt;Ali &amp; Co&gt;' in v_text) > 0, 'customer name is HTML-escaped: ' || v_text;
  assert position('<Ali' in v_text) = 0, 'no raw HTML from user input';

  perform pg_temp.login_as(v_mgr);
  perform pg_temp.expect_error('select telegram_bot_token from public.app_secrets', 'permission denied');
  perform pg_temp.expect_error('select * from public.notification_log', 'permission denied');
  perform pg_temp.logout();
  -- secrets never reach a browser, not even the admin's: admin server actions use the service key
  perform pg_temp.login_as(v_admin);
  perform pg_temp.expect_error('select telegram_bot_token from public.app_secrets', 'permission denied');
  perform pg_temp.logout();
end $$;
