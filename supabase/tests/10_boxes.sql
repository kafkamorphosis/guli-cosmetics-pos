-- Seller boxes: approved seller orders collect in one open box per seller and country; the manager
-- closes it (box shipping, orders ready) and hands it over (orders picked up).
do $$
declare
  s uuid := pg_temp.make_user('seller');
  s2 uuid := pg_temp.make_user('seller');
  m uuid := pg_temp.make_user('manager');
  p uuid := pg_temp.make_product('BX-1', 50, 6000, 10000, 8000, 600);
  one jsonb := jsonb_build_array(jsonb_build_object('product_id', p, 'qty', 1));
  three jsonb := jsonb_build_array(jsonb_build_object('product_id', p, 'qty', 3));
  k1 public.orders; k2 public.orders; k3 public.orders; u1 public.orders; x1 public.orders;
  b public.boxes;
  kr_box uuid; uz_box uuid;
  v_n int;
  v_text text;
  j jsonb;
begin
  update public.app_settings set kr_shipping_krw = 4000, uz_shipping_usd_per_kg = 10;
  update public.app_secrets set telegram_enabled = false;

  -- submit: address required, no shipping on the order
  perform pg_temp.login_as(s);
  perform pg_temp.expect_error(format('select public.submit_seller_order(gen_random_uuid(), %L::jsonb, ''+821012345678'', ''Ali'', ''  '', ''Gangnam'', ''cash'', ''KR'')', one), 'TEKPE_NEEDS_ADDRESS');
  perform pg_temp.expect_error(format('select public.submit_seller_order(gen_random_uuid(), %L::jsonb, ''+821012345678'', ''Ali'', ''Seul'', null, ''cash'', ''KR'')', one), 'TEKPE_NEEDS_ADDRESS');
  select * into k1 from public.submit_seller_order(gen_random_uuid(), one, '+821012345678', 'Ali', ' Seul ', 'Gangnam', 'cash', 'KR');
  assert k1.ship_city = 'Seul' and k1.ship_district = 'Gangnam', 'address stored, trimmed';
  assert k1.shipping_krw = 0 and k1.shipping_usd = 0 and k1.shipping_kg = 0, 'seller orders carry no shipping';
  select * into k2 from public.submit_seller_order(gen_random_uuid(), one, '+821022223333', 'Bek', 'Busan', 'Haeundae', 'card', 'KR');
  select * into u1 from public.submit_seller_order(gen_random_uuid(), three, '+998901112233', 'Vali', 'Toshkent', 'Chilonzor', 'cash', 'UZ');
  perform pg_temp.logout();
  perform pg_temp.login_as(s2);
  select * into x1 from public.submit_seller_order(gen_random_uuid(), one, '+821044445555', 'Sora', 'Seul', 'Mapo', 'cash', 'KR');
  perform pg_temp.logout();

  -- approve: one open box per seller and country
  perform pg_temp.login_as(m);
  select * into k1 from public.approve_order(k1.id);
  select * into k2 from public.approve_order(k2.id);
  select * into u1 from public.approve_order(u1.id);
  select * into x1 from public.approve_order(x1.id);
  perform pg_temp.logout();
  assert k1.box_id is not null and k1.box_id = k2.box_id, 'both Korea orders share one box';
  assert u1.box_id is not null and u1.box_id <> k1.box_id, 'Uzbekistan has its own box';
  assert x1.box_id <> k1.box_id, 'another seller has their own box';
  kr_box := k1.box_id;
  uz_box := u1.box_id;
  select * into b from public.boxes where id = kr_box;
  assert b.status = 'open' and b.seller_id = s and b.destination = 'KR' and b.box_no > 0, 'open Korea box';

  -- cancel in an open box: stock back, order leaves the box
  perform pg_temp.login_as(m);
  select * into k2 from public.cancel_order(k2.id);
  perform pg_temp.logout();
  assert k2.box_id is null, 'cancelled order leaves the open box';
  select stock into v_n from public.products where id = p;
  assert v_n = 50 - 1 - 3 - 1, 'stock restored for the cancelled order: ' || v_n;

  -- close
  perform pg_temp.login_as(m);
  select * into b from public.close_box(kr_box);
  assert b.status = 'closed' and b.order_count = 1 and b.item_count = 1 and b.shipping_krw = 4000 and b.closed_by = m, 'closed Korea box';
  select status::text into v_text from public.orders where id = k1.id;
  assert v_text = 'ready', 'orders in a closed box are ready';
  perform pg_temp.expect_error(format('select public.close_box(%L)', kr_box), 'BOX_CLOSED');
  perform pg_temp.expect_error(format('select public.close_box(%L)', gen_random_uuid()), 'BOX_NOT_FOUND');
  select * into b from public.close_box(uz_box);
  assert b.total_weight_g = 1800 and b.shipping_kg = 2 and b.shipping_usd = 20, 'Uzbekistan box: 1.8 kg rounds up to 2 kg';
  perform pg_temp.expect_error(format('select public.cancel_order(%L)', k1.id), 'BOX_CLOSED');
  perform pg_temp.expect_error(format('select public.set_order_status(%L, ''picked_up'')', k1.id), 'INVALID_STATUS_TRANSITION');
  perform pg_temp.logout();

  -- a later approval opens a new box; an empty open box cannot be closed
  perform pg_temp.login_as(s);
  select * into k3 from public.submit_seller_order(gen_random_uuid(), one, '+821012345678', 'Ali', 'Seul', 'Gangnam', 'cash', 'KR');
  perform pg_temp.logout();
  perform pg_temp.login_as(m);
  select * into k3 from public.approve_order(k3.id);
  assert k3.box_id is not null and k3.box_id <> kr_box, 'new open box after closing';
  perform public.cancel_order(k3.id);
  select count(*) into v_n from public.boxes where id = k3.box_id;
  assert v_n = 0, 'an open box emptied by a cancel is removed';
  perform pg_temp.expect_error(format('select public.close_box(%L)', k3.box_id), 'BOX_NOT_FOUND');

  -- hand over
  perform pg_temp.logout();
  update public.boxes set status = 'open' where id = uz_box;  -- an open box can't be picked up
  perform pg_temp.login_as(m);
  perform pg_temp.expect_error(format('select public.box_picked_up(%L)', uz_box), 'INVALID_STATUS_TRANSITION');
  perform pg_temp.logout();
  update public.boxes set status = 'closed' where id = uz_box;
  perform pg_temp.login_as(m);
  select * into b from public.box_picked_up(kr_box);
  assert b.status = 'picked_up' and b.picked_up_by = m, 'box picked up';
  select status::text into v_text from public.orders where id = k1.id;
  assert v_text = 'picked_up', 'its orders are picked up';

  -- box shipping counts in Statistika
  j := public.analytics_report(now() - interval '1 hour', now() + interval '1 hour', s);
  assert (j ->> 'shipping_krw')::int = 4000 and (j ->> 'shipping_usd')::numeric = 20, 'box shipping in the report: ' || j::text;
  perform pg_temp.logout();

  -- sellers: no direct box access, no box actions, box shown on their orders
  perform pg_temp.login_as(s);
  select count(*) into v_n from public.boxes;
  assert v_n = 0, 'sellers cannot read boxes directly';
  perform pg_temp.expect_error(format('select public.close_box(%L)', uz_box), 'NOT_AUTHORIZED');
  perform pg_temp.expect_error(format('select public.box_picked_up(%L)', uz_box), 'NOT_AUTHORIZED');
  j := public.my_order(k1.id);
  assert (j ->> 'box_no')::bigint > 0 and j ->> 'box_status' = 'picked_up' and j ->> 'ship_city' = 'Seul' and j ->> 'ship_district' = 'Gangnam', 'my_order shows box and address: ' || j::text;
  perform pg_temp.logout();
end $$;
