-- Seller boxes. A seller's approved orders collect in one open box per destination (Korea,
-- Uzbekistan). The manager closes the box (box shipping fixed, its orders ready, one A4 list) and
-- hands it to Tekpe (box and orders picked up). Seller orders carry no shipping of their own.

create type public.box_status as enum ('open', 'closed', 'picked_up');
create sequence public.box_no_seq;

create table public.boxes (
  id uuid primary key default gen_random_uuid(),
  box_no bigint not null default nextval('public.box_no_seq') unique,
  seller_id uuid not null constraint boxes_seller_id_fkey references public.profiles (id),
  destination public.destination not null,
  status public.box_status not null default 'open',
  order_count integer not null default 0,
  item_count integer not null default 0,
  total_weight_g integer not null default 0,
  shipping_krw integer not null default 0,
  shipping_usd numeric(10, 2) not null default 0,
  shipping_kg integer not null default 0,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by uuid constraint boxes_closed_by_fkey references public.profiles (id),
  picked_up_at timestamptz,
  picked_up_by uuid constraint boxes_picked_up_by_fkey references public.profiles (id)
);
alter sequence public.box_no_seq owned by public.boxes.box_no;
-- One open box per seller and destination.
create unique index boxes_one_open on public.boxes (seller_id, destination) where status = 'open';
create index boxes_status_idx on public.boxes (status, created_at desc);

alter table public.boxes enable row level security;
revoke all on public.boxes from anon, authenticated;
grant select on public.boxes to authenticated;
create policy boxes_select on public.boxes for select to authenticated
  using ((select public.app_role()) = 'manager');
alter publication supabase_realtime add table public.boxes;

alter table public.orders
  add column box_id uuid constraint orders_box_id_fkey references public.boxes (id),
  add column ship_city text,
  add column ship_district text;
create index orders_box_idx on public.orders (box_id) where box_id is not null;

-- Seller orders still waiting for approval were priced with per-order shipping; from now on their
-- shipping is charged on the box, so it is cleared here to avoid charging it twice.
update public.orders o set shipping_krw = 0, shipping_usd = 0, shipping_kg = 0
from public.profiles p
where p.id = o.seller_id and p.role = 'seller' and o.status = 'pending' and o.type = 'tekpe';

-- The open box of a seller and destination, created when there is none. Locks it, so a box being
-- closed right now is waited for and then skipped.
create function public.open_box_for(p_seller uuid, p_destination public.destination) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  loop
    select id into v_id from public.boxes
    where seller_id = p_seller and destination = p_destination and status = 'open'
    for update;
    if found then
      return v_id;
    end if;
    begin
      insert into public.boxes (seller_id, destination) values (p_seller, p_destination) returning id into v_id;
      return v_id;
    exception when unique_violation then
      -- Another approval opened it at the same moment: take that one.
    end;
  end loop;
end $$;

-- Order lines writer gains a switch for shipping: seller orders ship in a box, so none per order.
drop function public.place_order_lines(uuid, jsonb, boolean, uuid);
create function public.place_order_lines(
  p_order_id uuid, p_items jsonb, p_deduct boolean, p_uid uuid, p_with_shipping boolean default true
) returns public.orders
language plpgsql security definer set search_path = '' as $$
declare
  v_order public.orders;
  v_settings public.app_settings;
  v_item record;
  v_price integer;
  v_line_count integer := 0;
  v_item_count integer := 0;
  v_weight integer := 0;
  v_subtotal integer := 0;
  v_cost integer := 0;
  v_ship_krw integer := 0;
  v_ship_usd numeric(10, 2) := 0;
  v_ship_kg integer := 0;
begin
  select * into v_order from public.orders where id = p_order_id;
  for v_item in
    select x.product_id, x.qty, x.is_wholesale, p.barcode, p.name, p.photo_path,
           p.retail_price, p.wholesale_price, p.cost_price, p.weight_g
    from (
      select (e ->> 'product_id')::uuid as product_id,
             sum((e ->> 'qty')::integer)::integer as qty,
             bool_or(coalesce((e ->> 'is_wholesale')::boolean, false)) as is_wholesale
      from jsonb_array_elements(p_items) e
      group by 1
    ) x
    join public.products p on p.id = x.product_id
    order by p.name
  loop
    v_price := case when v_item.is_wholesale then v_item.wholesale_price else v_item.retail_price end;
    insert into public.order_items (order_id, product_id, barcode, name, photo_path, unit_price, is_wholesale,
                                    unit_cost, unit_weight_g, qty, line_total, line_weight_g)
    values (p_order_id, v_item.product_id, v_item.barcode, v_item.name, v_item.photo_path, v_price, v_item.is_wholesale,
            v_item.cost_price, v_item.weight_g, v_item.qty, v_price * v_item.qty, v_item.weight_g * v_item.qty);
    if p_deduct then
      update public.products set stock = stock - v_item.qty where id = v_item.product_id;
      insert into public.stock_movements (product_id, kind, qty_change, order_id, user_id)
      values (v_item.product_id, 'sale', -v_item.qty, p_order_id, p_uid);
    end if;
    v_line_count := v_line_count + 1;
    v_item_count := v_item_count + v_item.qty;
    v_weight := v_weight + v_item.weight_g * v_item.qty;
    v_subtotal := v_subtotal + v_price * v_item.qty;
    v_cost := v_cost + v_item.cost_price * v_item.qty;
  end loop;

  if p_with_shipping then
    select * into v_settings from public.app_settings;
    if v_order.destination = 'KR' then
      v_ship_krw := v_settings.kr_shipping_krw;
    elsif v_order.destination = 'UZ' then
      v_ship_kg := greatest(1, ceil(v_weight / 1000.0)::integer);
      v_ship_usd := v_ship_kg * v_settings.uz_shipping_usd_per_kg;
    end if;
  end if;

  update public.orders set
    line_count = v_line_count, item_count = v_item_count, total_weight_g = v_weight,
    subtotal = v_subtotal, cost_total = v_cost,
    shipping_krw = v_ship_krw, shipping_usd = v_ship_usd, shipping_kg = v_ship_kg
  where id = p_order_id
  returning * into v_order;
  return v_order;
end $$;

-- Seller submit: client city and district are required; no per-order shipping.
drop function public.submit_seller_order(uuid, jsonb, text, text, public.payment_method, public.destination);
create function public.submit_seller_order(
  p_request_id uuid,
  p_items jsonb,
  p_customer_phone text,
  p_customer_name text,
  p_city text,
  p_district text,
  p_payment_method public.payment_method,
  p_destination public.destination
) returns public.orders
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_staff();
  v_order public.orders;
  v_phone text := nullif(trim(p_customer_phone), '');
  v_name text := nullif(trim(p_customer_name), '');
  v_city text := nullif(trim(p_city), '');
  v_district text := nullif(trim(p_district), '');
begin
  if public.app_role() <> 'seller' then
    raise exception 'NOT_AUTHORIZED';
  end if;
  select * into v_order from public.orders where request_id = p_request_id;
  if found then
    if v_order.seller_id <> v_uid then
      raise exception 'NOT_AUTHORIZED';
    end if;
    return v_order;
  end if;
  perform public.check_order_input(p_items, 'tekpe', p_destination, v_phone, v_name);
  if v_city is null or v_district is null then
    raise exception 'TEKPE_NEEDS_ADDRESS';
  end if;
  perform public.lock_order_products(array(select distinct (e ->> 'product_id')::uuid from jsonb_array_elements(p_items) e));

  insert into public.orders (request_id, qr_token, customer_id, seller_id, type, destination, payment_method, status,
                             ship_city, ship_district)
  values (p_request_id, public.generate_qr_token(), public.upsert_customer(v_phone, v_name), v_uid, 'tekpe',
          p_destination, p_payment_method, 'pending', left(v_city, 120), left(v_district, 120))
  on conflict (request_id) do nothing
  returning * into v_order;
  if v_order.id is null then
    select * into v_order from public.orders where request_id = p_request_id;
    return v_order;
  end if;

  v_order := public.place_order_lines(v_order.id, p_items, false, v_uid, false);
  perform public.notify_telegram('tekpe_order', public.tekpe_alert_text(v_order));
  return v_order;
end $$;

-- Approve: stock as before, then into the seller's open box for the destination.
create or replace function public.approve_order(p_order_id uuid) returns public.orders
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_pos_role();
  v_order public.orders;
  v_item record;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;
  if v_order.status <> 'pending' then
    raise exception 'INVALID_STATUS_TRANSITION';
  end if;
  perform public.lock_order_products(array(select distinct product_id from public.order_items where order_id = p_order_id));

  for v_item in
    select product_id, sum(qty)::integer as qty from public.order_items
    where order_id = p_order_id group by product_id order by product_id
  loop
    update public.products set stock = stock - v_item.qty where id = v_item.product_id;
    insert into public.stock_movements (product_id, kind, qty_change, order_id, user_id)
    values (v_item.product_id, 'sale', -v_item.qty, p_order_id, v_uid);
  end loop;

  update public.orders set status = 'new', approved_at = now(), approved_by = v_uid,
         box_id = public.open_box_for(v_order.seller_id, v_order.destination)
  where id = p_order_id
  returning * into v_order;
  return v_order;
end $$;

-- Cancel: an order in a packed box can no longer be cancelled; one in an open box leaves it.
create or replace function public.cancel_order(p_order_id uuid) returns public.orders
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_pos_role();
  v_order public.orders;
  v_item record;
  v_box uuid;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;
  if v_order.status = 'cancelled' then
    raise exception 'ORDER_ALREADY_CANCELLED';
  end if;
  if v_order.box_id is not null and exists (select 1 from public.boxes where id = v_order.box_id and status <> 'open') then
    raise exception 'BOX_CLOSED';
  end if;
  v_box := v_order.box_id;

  if v_order.status <> 'pending' then
    for v_item in
      select product_id, sum(qty)::integer as qty from public.order_items
      where order_id = p_order_id group by product_id order by product_id
    loop
      update public.products set stock = stock + v_item.qty where id = v_item.product_id;
      insert into public.stock_movements (product_id, kind, qty_change, order_id, user_id)
      values (v_item.product_id, 'cancel', v_item.qty, p_order_id, v_uid);
    end loop;
  end if;

  update public.orders set status = 'cancelled', cancelled_at = now(), cancelled_by = v_uid, box_id = null
  where id = p_order_id
  returning * into v_order;
  -- An open box left with no orders disappears instead of lingering empty in Qutilar.
  if v_box is not null then
    delete from public.boxes b
    where b.id = v_box and b.status = 'open' and not exists (select 1 from public.orders o where o.box_id = b.id);
  end if;
  return v_order;
end $$;

-- Single-order Tekpe moves don't apply to boxed orders; the box moves them.
create or replace function public.set_order_status(p_order_id uuid, p_status public.order_status) returns public.orders
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_pos_role();
  v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;
  if v_order.box_id is not null
     or not ((v_order.status = 'new' and p_status = 'ready') or (v_order.status = 'ready' and p_status = 'picked_up')) then
    raise exception 'INVALID_STATUS_TRANSITION';
  end if;

  update public.orders set
    status = p_status,
    ready_at = case when p_status = 'ready' then now() else ready_at end,
    ready_by = case when p_status = 'ready' then v_uid else ready_by end,
    picked_up_at = case when p_status = 'picked_up' then now() else picked_up_at end,
    picked_up_by = case when p_status = 'picked_up' then v_uid else picked_up_by end
  where id = p_order_id
  returning * into v_order;
  return v_order;
end $$;

create function public.close_box(p_box_id uuid) returns public.boxes
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_pos_role();
  v_box public.boxes;
  v_settings public.app_settings;
  v_orders integer;
  v_items integer;
  v_weight integer;
  v_kg integer := 0;
begin
  select * into v_box from public.boxes where id = p_box_id for update;
  if not found then
    raise exception 'BOX_NOT_FOUND';
  end if;
  if v_box.status <> 'open' then
    raise exception 'BOX_CLOSED';
  end if;

  -- Totals come from the orders actually moved, so an order cancelled meanwhile is never counted.
  with moved as (
    update public.orders set status = 'ready', ready_at = now(), ready_by = v_uid
    where box_id = p_box_id and status = 'new'
    returning item_count, total_weight_g
  )
  select count(*), coalesce(sum(item_count), 0), coalesce(sum(total_weight_g), 0)
  into v_orders, v_items, v_weight
  from moved;
  if v_orders = 0 then
    raise exception 'BOX_EMPTY';
  end if;

  select * into v_settings from public.app_settings;
  if v_box.destination = 'UZ' then
    v_kg := greatest(1, ceil(v_weight / 1000.0)::integer);
  end if;
  update public.boxes set
    status = 'closed', closed_at = now(), closed_by = v_uid,
    order_count = v_orders, item_count = v_items, total_weight_g = v_weight,
    shipping_kg = v_kg,
    shipping_krw = case when v_box.destination = 'KR' then v_settings.kr_shipping_krw else 0 end,
    shipping_usd = case when v_box.destination = 'UZ' then v_kg * v_settings.uz_shipping_usd_per_kg else 0 end
  where id = p_box_id
  returning * into v_box;
  return v_box;
end $$;

create function public.box_picked_up(p_box_id uuid) returns public.boxes
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_pos_role();
  v_box public.boxes;
begin
  select * into v_box from public.boxes where id = p_box_id for update;
  if not found then
    raise exception 'BOX_NOT_FOUND';
  end if;
  if v_box.status <> 'closed' then
    raise exception 'INVALID_STATUS_TRANSITION';
  end if;
  update public.orders set status = 'picked_up', picked_up_at = now(), picked_up_by = v_uid
  where box_id = p_box_id and status = 'ready';
  update public.boxes set status = 'picked_up', picked_up_at = now(), picked_up_by = v_uid
  where id = p_box_id
  returning * into v_box;
  return v_box;
end $$;

-- Sellers see the box and address of their orders.
create or replace function public.seller_order_json(o public.orders, p_with_items boolean) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', o.id, 'order_no', o.order_no, 'request_id', o.request_id, 'created_at', o.created_at,
    'status', o.status, 'type', o.type, 'destination', o.destination, 'payment_method', o.payment_method,
    'item_count', o.item_count, 'line_count', o.line_count, 'total_weight_g', o.total_weight_g,
    'subtotal', o.subtotal, 'shipping_krw', o.shipping_krw, 'shipping_usd', o.shipping_usd, 'shipping_kg', o.shipping_kg,
    'approved_at', o.approved_at, 'ready_at', o.ready_at, 'picked_up_at', o.picked_up_at, 'cancelled_at', o.cancelled_at,
    'ship_city', o.ship_city, 'ship_district', o.ship_district, 'box_id', o.box_id,
    'box_no', (select b.box_no from public.boxes b where b.id = o.box_id),
    'box_status', (select b.status from public.boxes b where b.id = o.box_id),
    'customer', (select jsonb_build_object('name', c.name, 'phone', c.phone) from public.customers c where c.id = o.customer_id)
  ) || case when p_with_items then jsonb_build_object('items', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', i.id, 'barcode', i.barcode, 'name', i.name, 'photo_path', i.photo_path, 'unit_price', i.unit_price,
      'is_wholesale', i.is_wholesale, 'qty', i.qty, 'line_total', i.line_total,
      'unit_weight_g', i.unit_weight_g, 'line_weight_g', i.line_weight_g) order by i.name)
    from public.order_items i where i.order_id = o.id), '[]'::jsonb)) else '{}'::jsonb end
$$;

-- Statistika: box shipping counts on the day the box is closed.
create or replace function public.analytics_report(p_from timestamptz, p_to timestamptz, p_seller uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_seller uuid := public.analytics_scope(p_seller);
  v_show_cost boolean := public.app_role() = 'manager';
  v_result jsonb;
begin
  with o as (
    select * from public.orders
    where status not in ('cancelled', 'pending')
      and created_at >= p_from and created_at < p_to
      and (v_seller is null or seller_id = v_seller)
  ),
  box_ship as (
    select coalesce(sum(shipping_krw), 0) as krw, coalesce(sum(shipping_usd), 0) as usd
    from public.boxes
    where status <> 'open' and closed_at >= p_from and closed_at < p_to
      and (v_seller is null or seller_id = v_seller)
  ),
  totals as (
    select count(*) as orders,
           coalesce(sum(item_count), 0) as items,
           coalesce(sum(subtotal), 0) as revenue,
           coalesce(sum(cost_total), 0) as cost,
           coalesce(sum(shipping_krw), 0) as shipping_krw,
           coalesce(sum(shipping_usd), 0) as shipping_usd
    from o
  ),
  pay as (
    select payment_method as method, count(*) as orders, sum(subtotal) as revenue
    from o group by payment_method
  ),
  prod as (
    select i.product_id,
           (array_agg(i.name order by o.created_at desc))[1] as name,
           (array_agg(i.photo_path order by o.created_at desc))[1] as photo_path,
           (array_agg(i.unit_weight_g order by o.created_at desc))[1] as unit_weight_g,
           sum(i.qty) as qty,
           sum(i.line_total) as revenue,
           sum(i.unit_cost * i.qty) as cost
    from public.order_items i join o on o.id = i.order_id
    group by i.product_id
  )
  select jsonb_build_object(
    'orders', t.orders,
    'items', t.items,
    'revenue', t.revenue,
    'cost', case when v_show_cost then to_jsonb(t.cost) else 'null'::jsonb end,
    'profit', case when v_show_cost then to_jsonb(t.revenue - t.cost) else 'null'::jsonb end,
    'shipping_krw', t.shipping_krw + bs.krw,
    'shipping_usd', t.shipping_usd + bs.usd,
    'by_payment', coalesce((select jsonb_agg(to_jsonb(pay) order by pay.revenue desc) from pay), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(case when v_show_cost then to_jsonb(prod) else to_jsonb(prod) - 'cost' end
                       order by prod.revenue desc, prod.name)
      from prod), '[]'::jsonb)
  )
  into v_result
  from totals t, box_ship bs;
  return v_result;
end $$;

revoke all on function public.open_box_for(uuid, public.destination) from public, anon, authenticated;
revoke all on function public.place_order_lines(uuid, jsonb, boolean, uuid, boolean) from public, anon, authenticated;
revoke all on function public.submit_seller_order(uuid, jsonb, text, text, text, text, public.payment_method, public.destination) from public, anon;
revoke all on function public.close_box(uuid) from public, anon;
revoke all on function public.box_picked_up(uuid) from public, anon;
grant execute on function public.submit_seller_order(uuid, jsonb, text, text, text, text, public.payment_method, public.destination) to authenticated;
grant execute on function public.close_box(uuid) to authenticated;
grant execute on function public.box_picked_up(uuid) to authenticated;
