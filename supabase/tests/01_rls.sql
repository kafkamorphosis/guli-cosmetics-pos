do $$
declare
  v_mgr uuid := pg_temp.make_user('manager');
  v_admin uuid := pg_temp.make_user('admin');
  v_inactive uuid := pg_temp.make_user('manager', false);
  v_n int;
  v_base bigint := (select cost_value from public.inventory_summary);  -- real stock already in the database
begin
  perform pg_temp.make_product('RLS-1', 3, 6000, 10000, 8000, 250);
  perform pg_temp.make_product('RLS-2', -2, 12000, 20000, 15000, 500);

  perform pg_temp.login_as(v_mgr);
  select count(*) into v_n from public.products where barcode like 'RLS-%';
  assert v_n = 2, 'manager sees products';
  update public.products set name = 'Renamed' where barcode = 'RLS-1';
  get diagnostics v_n = row_count;
  assert v_n = 1, 'manager can rename a product';
  perform pg_temp.expect_error('update public.products set stock = 99', 'permission denied');
  perform pg_temp.expect_error('update public.products set barcode = ''X''', 'permission denied');
  perform pg_temp.expect_error(
    'insert into public.orders (seller_id, type, payment_method, status) values (auth.uid(), ''store'', ''cash'', ''completed'')',
    'permission denied');
  perform pg_temp.expect_error('delete from public.products', 'permission denied');
  update public.app_settings set kr_shipping_krw = 1;
  get diagnostics v_n = row_count;
  assert v_n = 0, 'manager cannot change settings';
  select cost_value into v_n from public.inventory_summary;
  assert v_n = v_base + 18000, 'inventory_summary ignores negative stock: got ' || v_n;
  perform pg_temp.logout();

  perform pg_temp.login_as(v_admin);
  select count(*) into v_n from public.products;
  assert v_n = 0, 'admin does not see products';
  update public.app_settings set kr_shipping_krw = 4500;
  get diagnostics v_n = row_count;
  assert v_n = 1, 'admin can change settings';
  perform pg_temp.logout();

  perform pg_temp.login_as(v_inactive);
  select count(*) into v_n from public.products;
  assert v_n = 0, 'inactive manager sees nothing';
  perform pg_temp.logout();

  set local role anon;
  perform pg_temp.expect_error('select count(*) from public.products', 'permission denied');
  perform pg_temp.expect_error('select count(*) from public.orders', 'permission denied');
  reset role;
end $$;

-- self-signup can't grant itself a role: user_metadata.role is ignored, no app role means inactive
do $$
declare v_id uuid := gen_random_uuid(); v_active boolean; v_role public.app_role;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'intruder@gulicosmetics.local',
          jsonb_build_object('username', 'intruder', 'role', 'admin'), jsonb_build_object('provider', 'email'), now(), now());
  select is_active, role into v_active, v_role from public.profiles where id = v_id;
  assert v_active = false, 'self-signup profile is inactive';
  assert v_role = 'seller', 'self-signup role is not taken from user metadata';
end $$;

-- the admin API writes app_metadata.role after the insert; the role must still apply
do $$
declare v_id uuid := gen_random_uuid(); v_active boolean; v_role public.app_role;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'late@gulicosmetics.local',
          jsonb_build_object('username', 'late'), jsonb_build_object('provider', 'email'), now(), now());
  update auth.users set raw_app_meta_data = raw_app_meta_data || jsonb_build_object('role', 'admin') where id = v_id;
  select is_active, role into v_active, v_role from public.profiles where id = v_id;
  assert v_role = 'admin', 'role set by admin API after insert is applied';
  assert v_active, 'profile becomes active once a role is granted';
  update public.profiles set is_active = false where id = v_id;
  update auth.users set raw_app_meta_data = raw_app_meta_data || jsonb_build_object('providers', jsonb_build_array('email')) where id = v_id;
  select is_active into v_active from public.profiles where id = v_id;
  assert not v_active, 'unrelated metadata updates keep a disabled user disabled';
end $$;

-- a later role change never re-enables a disabled account
do $$
declare v_id uuid := gen_random_uuid(); v_active boolean; v_role public.app_role;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rc@gulicosmetics.local',
          jsonb_build_object('username', 'rc'), jsonb_build_object('provider', 'email', 'role', 'seller'), now(), now());
  update public.profiles set is_active = false where id = v_id;
  update auth.users set raw_app_meta_data = raw_app_meta_data || jsonb_build_object('role', 'manager') where id = v_id;
  select is_active, role into v_active, v_role from public.profiles where id = v_id;
  assert v_role = 'manager', 'role change applies';
  assert not v_active, 'role change keeps the account disabled';
end $$;
