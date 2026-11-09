-- Prepended to every test file by scripts/run-db-tests.mjs, inside begin ... rollback.
-- Fixtures (make_user, make_product, direct updates) must run while logged out.

create function pg_temp.make_user(p_role text, p_active boolean default true) returns uuid
language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'u_' || left(v_id::text, 8) || '@gulicosmetics.local',
          jsonb_build_object('username', 'u_' || left(v_id::text, 8), 'full_name', 'Test ' || p_role),
          jsonb_build_object('provider', 'email', 'role', p_role),
          now(), now());
  update public.profiles set is_active = p_active where id = v_id;
  return v_id;
end $$;

create function pg_temp.login_as(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;

create function pg_temp.logout() returns void
language plpgsql as $$ begin reset role; end $$;

create function pg_temp.make_product(p_barcode text, p_stock int, p_cost int, p_retail int, p_wholesale int, p_weight int)
returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into public.products (barcode, name, cost_price, retail_price, wholesale_price, weight_g, stock)
  values (p_barcode, 'Product ' || p_barcode, p_cost, p_retail, p_wholesale, p_weight, p_stock)
  returning id into v_id;
  return v_id;
end $$;

-- Asserts that a statement raises an exception whose message contains p_expected.
create function pg_temp.expect_error(p_sql text, p_expected text) returns void
language plpgsql as $$
begin
  execute p_sql;
  raise exception 'expected error "%" from: %', p_expected, p_sql;
exception when others then
  if sqlerrm like 'expected error%' or position(p_expected in sqlerrm) = 0 then
    raise exception 'statement % raised "%" instead of "%"', p_sql, sqlerrm, p_expected;
  end if;
end $$;
