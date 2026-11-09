-- Seller orders: a seller submits a Tekpe order as 'pending' (prices snapshotted, no stock taken);
-- a manager approves it (stock deducted, status 'new') or rejects it (cancel_order).
-- Sellers read only through the RPCs at the end, which never return cost.

-- Shared input checks for Kassa and seller orders.
create function public.check_order_input(
  p_items jsonb, p_type public.order_type, p_destination public.destination, p_phone text, p_name text
) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_CART';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) e
    where case when jsonb_typeof(e -> 'qty') = 'number'
               then (e ->> 'qty')::numeric < 1 or (e ->> 'qty')::numeric <> trunc((e ->> 'qty')::numeric)
               else true end
  ) then
    raise exception 'INVALID_QTY';
  end if;
  if p_type = 'tekpe' and p_destination is null then
    raise exception 'TEKPE_NEEDS_DESTINATION';
  end if;
  if p_type = 'tekpe' and (p_phone is null or p_name is null) then
    raise exception 'TEKPE_NEEDS_CUSTOMER';
  end if;
  if p_phone is not null and p_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'INVALID_PHONE';
  end if;
end $$;

-- Locks the products of p_items (stable order) and raises PRODUCT_NOT_FOUND for unknown or
-- archived ones.
create function public.lock_order_products(p_product_ids uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.products where id = any(p_product_ids) order by id for update;
  if exists (
    select 1 from unnest(p_product_ids) pid
    where not exists (select 1 from public.products p where p.id = pid and not p.is_archived)
  ) then
    raise exception 'PRODUCT_NOT_FOUND';
  end if;
end $$;

-- Writes the snapshot lines and totals of an order. p_deduct: take the stock now (Kassa) or not
-- (seller orders, which take it at approval).
create function public.place_order_lines(p_order_id uuid, p_items jsonb, p_deduct boolean, p_uid uuid)
returns public.orders
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

  select * into v_settings from public.app_settings;
  if v_order.destination = 'KR' then
    v_ship_krw := v_settings.kr_shipping_krw;
  elsif v_order.destination = 'UZ' then
    v_ship_kg := greatest(1, ceil(v_weight / 1000.0)::integer);
    v_ship_usd := v_ship_kg * v_settings.uz_shipping_usd_per_kg;
  end if;

  update public.orders set
    line_count = v_line_count, item_count = v_item_count, total_weight_g = v_weight,
    subtotal = v_subtotal, cost_total = v_cost,
    shipping_krw = v_ship_krw, shipping_usd = v_ship_usd, shipping_kg = v_ship_kg
  where id = p_order_id
  returning * into v_order;
  return v_order;
end $$;

create or replace function public.upsert_customer(p_phone text, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if p_phone is null then
    return null;
  end if;
  insert into public.customers (phone, name) values (p_phone, p_name)
  on conflict (phone) do update set name = coalesce(excluded.name, public.customers.name)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.tekpe_alert_text(o public.orders) returns text
language sql stable security definer set search_path = '' as $$
  select '📦 <b>Yangi Tekpe #' || lpad(o.order_no::text, 6, '0') || '</b> · ' ||
         case o.destination when 'UZ' then 'Oʻzbekiston' else 'Koreya' end || chr(10) ||
         public.html_escape(coalesce(c.name, '—')) || ' · ' || public.html_escape(coalesce(c.phone, '')) || chr(10) ||
         o.item_count || ' ta · ' || public.fmt_num(o.total_weight_g / 1000.0) || ' kg · ' ||
         public.fmt_krw(o.subtotal + o.shipping_krw) ||
         case when o.shipping_usd > 0 then ' + ' || public.fmt_num(o.shipping_usd) || ' $' else '' end ||
         case when o.status = 'pending'
              then chr(10) || '⏳ Tasdiqlash kerak · ' || public.html_escape(coalesce(nullif(s.full_name, ''), s.username, '—'))
              else '' end
  from (select 1) one
  left join public.customers c on c.id = o.customer_id
  left join public.profiles s on s.id = o.seller_id
$$;

-- Kassa: managers only; same behaviour as before, now built from the shared pieces.
create or replace function public.create_order(
  p_request_id uuid,
  p_items jsonb,
  p_customer_phone text,
  p_customer_name text,
  p_payment_method public.payment_method,
  p_type public.order_type,
  p_destination public.destination
) returns public.orders
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_pos_role();
  v_order public.orders;
  v_phone text := nullif(trim(p_customer_phone), '');
  v_name text := nullif(trim(p_customer_name), '');
  v_dest public.destination := case when p_type = 'store' then null else p_destination end;
begin
  select * into v_order from public.orders where request_id = p_request_id;
  if found then
    return v_order;
  end if;
  perform public.check_order_input(p_items, p_type, p_destination, v_phone, v_name);
  perform public.lock_order_products(array(select distinct (e ->> 'product_id')::uuid from jsonb_array_elements(p_items) e));

  insert into public.orders (request_id, qr_token, customer_id, seller_id, type, destination, payment_method, status)
  values (p_request_id, public.generate_qr_token(), public.upsert_customer(v_phone, v_name), v_uid, p_type, v_dest,
          p_payment_method, case when p_type = 'store' then 'completed'::public.order_status else 'new'::public.order_status end)
  on conflict (request_id) do nothing
  returning * into v_order;
  if v_order.id is null then
    select * into v_order from public.orders where request_id = p_request_id;
    return v_order;
  end if;

  v_order := public.place_order_lines(v_order.id, p_items, true, v_uid);
  if p_type = 'tekpe' then
    perform public.notify_telegram('tekpe_order', public.tekpe_alert_text(v_order));
  end if;
  return v_order;
end $$;

create function public.submit_seller_order(
  p_request_id uuid,
  p_items jsonb,
  p_customer_phone text,
  p_customer_name text,
  p_payment_method public.payment_method,
  p_destination public.destination
) returns public.orders
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_staff();
  v_order public.orders;
  v_phone text := nullif(trim(p_customer_phone), '');
  v_name text := nullif(trim(p_customer_name), '');
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
  perform public.lock_order_products(array(select distinct (e ->> 'product_id')::uuid from jsonb_array_elements(p_items) e));

  insert into public.orders (request_id, qr_token, customer_id, seller_id, type, destination, payment_method, status)
  values (p_request_id, public.generate_qr_token(), public.upsert_customer(v_phone, v_name), v_uid, 'tekpe',
          p_destination, p_payment_method, 'pending')
  on conflict (request_id) do nothing
  returning * into v_order;
  if v_order.id is null then
    select * into v_order from public.orders where request_id = p_request_id;
    return v_order;
  end if;

  v_order := public.place_order_lines(v_order.id, p_items, false, v_uid);
  perform public.notify_telegram('tekpe_order', public.tekpe_alert_text(v_order));
  return v_order;
end $$;

create function public.approve_order(p_order_id uuid) returns public.orders
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

  update public.orders set status = 'new', approved_at = now(), approved_by = v_uid
  where id = p_order_id
  returning * into v_order;
  return v_order;
end $$;

-- Reject: cancelling a pending order returns no stock, because none was taken.
create or replace function public.cancel_order(p_order_id uuid) returns public.orders
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
  if v_order.status = 'cancelled' then
    raise exception 'ORDER_ALREADY_CANCELLED';
  end if;

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

  update public.orders set status = 'cancelled', cancelled_at = now(), cancelled_by = v_uid
  where id = p_order_id
  returning * into v_order;
  return v_order;
end $$;

-- Statistika: pending orders are not sales yet; sellers get no cost or profit.
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
    'shipping_krw', t.shipping_krw,
    'shipping_usd', t.shipping_usd,
    'by_payment', coalesce((select jsonb_agg(to_jsonb(pay) order by pay.revenue desc) from pay), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(case when v_show_cost then to_jsonb(prod) else to_jsonb(prod) - 'cost' end
                       order by prod.revenue desc, prod.name)
      from prod), '[]'::jsonb)
  )
  into v_result
  from totals t;
  return v_result;
end $$;

create or replace function public.least_sold(p_days integer, p_seller uuid default null, p_limit integer default 10)
returns table (product_id uuid, name text, photo_path text, stock integer, qty_sold bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_seller uuid := public.analytics_scope(p_seller);
begin
  return query
  select p.id, p.name, p.photo_path, p.stock, coalesce(s.qty, 0)::bigint
  from public.products p
  left join (
    select i.product_id as pid, sum(i.qty) as qty
    from public.order_items i
    join public.orders o on o.id = i.order_id
    where o.status not in ('cancelled', 'pending')
      and o.created_at >= now() - make_interval(days => p_days)
      and o.created_at <= now()
      and (v_seller is null or o.seller_id = v_seller)
    group by i.product_id
  ) s on s.pid = p.id
  where not p.is_archived and p.stock > 0
  order by coalesce(s.qty, 0) asc, p.name
  limit greatest(1, least(coalesce(p_limit, 10), 100));
end $$;

create or replace function public.customer_stats(p_seller uuid default null, p_customer uuid default null)
returns table (
  id uuid, phone text, name text, created_at timestamptz, orders bigint, items bigint, spent bigint,
  shipping_usd numeric, tekpe_orders bigint, last_order_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_seller uuid := public.analytics_scope(p_seller);
begin
  return query
  select c.id, c.phone, c.name, c.created_at,
         count(o.id) filter (where o.status not in ('cancelled', 'pending')),
         coalesce(sum(o.item_count) filter (where o.status not in ('cancelled', 'pending')), 0)::bigint,
         coalesce(sum(o.subtotal + o.shipping_krw) filter (where o.status not in ('cancelled', 'pending')), 0)::bigint,
         coalesce(sum(o.shipping_usd) filter (where o.status not in ('cancelled', 'pending')), 0)::numeric,
         count(o.id) filter (where o.status not in ('cancelled', 'pending') and o.type = 'tekpe'),
         max(o.created_at) filter (where o.status not in ('cancelled', 'pending'))
  from public.customers c
  join public.orders o on o.customer_id = c.id
  where (v_seller is null or o.seller_id = v_seller)
    and (p_customer is null or c.id = p_customer)
  group by c.id
  order by max(o.created_at) desc;
end $$;

-- ── Seller reads ──────────────────────────────────────────────────────────

create function public.seller_catalog(p_query text default null, p_limit integer default 60, p_offset integer default 0)
returns table (id uuid, barcode text, name text, photo_path text, retail_price integer,
               wholesale_price integer, weight_g integer, stock integer)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_q text := nullif(trim(replace(replace(coalesce(p_query, ''), '%', ''), '_', '')), '');
begin
  perform public.require_staff();
  return query
  select p.id, p.barcode, p.name, p.photo_path, p.retail_price, p.wholesale_price, p.weight_g, p.stock
  from public.products p
  where not p.is_archived and (v_q is null or p.name ilike '%' || v_q || '%')
  order by p.name
  limit greatest(1, least(coalesce(p_limit, 60), 200)) offset greatest(coalesce(p_offset, 0), 0);
end $$;

create function public.seller_order_json(o public.orders, p_with_items boolean) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', o.id, 'order_no', o.order_no, 'request_id', o.request_id, 'created_at', o.created_at,
    'status', o.status, 'type', o.type, 'destination', o.destination, 'payment_method', o.payment_method,
    'item_count', o.item_count, 'line_count', o.line_count, 'total_weight_g', o.total_weight_g,
    'subtotal', o.subtotal, 'shipping_krw', o.shipping_krw, 'shipping_usd', o.shipping_usd, 'shipping_kg', o.shipping_kg,
    'approved_at', o.approved_at, 'ready_at', o.ready_at, 'picked_up_at', o.picked_up_at, 'cancelled_at', o.cancelled_at,
    'customer', (select jsonb_build_object('name', c.name, 'phone', c.phone) from public.customers c where c.id = o.customer_id)
  ) || case when p_with_items then jsonb_build_object('items', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', i.id, 'barcode', i.barcode, 'name', i.name, 'photo_path', i.photo_path, 'unit_price', i.unit_price,
      'is_wholesale', i.is_wholesale, 'qty', i.qty, 'line_total', i.line_total,
      'unit_weight_g', i.unit_weight_g, 'line_weight_g', i.line_weight_g) order by i.name)
    from public.order_items i where i.order_id = o.id), '[]'::jsonb)) else '{}'::jsonb end
$$;

create function public.my_orders(p_limit integer default 50, p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_staff();
begin
  return coalesce((
    select jsonb_agg(public.seller_order_json(o, false) order by o.created_at desc)
    from (
      select * from public.orders where seller_id = v_uid
      order by created_at desc
      limit greatest(1, least(coalesce(p_limit, 50), 200)) offset greatest(coalesce(p_offset, 0), 0)
    ) o
  ), '[]'::jsonb);
end $$;

create function public.my_order(p_id uuid default null, p_request_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_staff();
  v_order public.orders;
begin
  select * into v_order from public.orders
  where seller_id = v_uid and (id = p_id or request_id = p_request_id)
  limit 1;
  if not found then
    return null;
  end if;
  return public.seller_order_json(v_order, true);
end $$;

revoke all on function public.check_order_input(jsonb, public.order_type, public.destination, text, text) from public, anon, authenticated;
revoke all on function public.lock_order_products(uuid[]) from public, anon, authenticated;
revoke all on function public.place_order_lines(uuid, jsonb, boolean, uuid) from public, anon, authenticated;
revoke all on function public.upsert_customer(text, text) from public, anon, authenticated;
revoke all on function public.tekpe_alert_text(public.orders) from public, anon, authenticated;
revoke all on function public.seller_order_json(public.orders, boolean) from public, anon, authenticated;
revoke all on function public.submit_seller_order(uuid, jsonb, text, text, public.payment_method, public.destination) from public, anon;
revoke all on function public.approve_order(uuid) from public, anon;
revoke all on function public.seller_catalog(text, integer, integer) from public, anon;
revoke all on function public.my_orders(integer, integer) from public, anon;
revoke all on function public.my_order(uuid, uuid) from public, anon;
grant execute on function public.submit_seller_order(uuid, jsonb, text, text, public.payment_method, public.destination) to authenticated;
grant execute on function public.approve_order(uuid) to authenticated;
grant execute on function public.seller_catalog(text, integer, integer) to authenticated;
grant execute on function public.my_orders(integer, integer) to authenticated;
grant execute on function public.my_order(uuid, uuid) to authenticated;
