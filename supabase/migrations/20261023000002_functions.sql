-- Guli cosmetics POS — RPC functions. All stock/order writes go through these.
-- Errors are raised as bare codes (see src/lib/domain/errors.ts for the Uzbek texts).

-- Caller's id if they are an active owner/seller; otherwise NOT_AUTHORIZED.
create function public.require_pos_role() returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(public.app_role() in ('owner', 'seller'), false) is false then
    raise exception 'NOT_AUTHORIZED';
  end if;
  return auth.uid();
end $$;

-- 10 chars from an alphabet without look-alikes (no I, L, O, 0, 1). Only thing printed in the QR.
create function public.generate_qr_token() returns text
language plpgsql volatile set search_path = '' as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_token text;
begin
  loop
    v_bytes := extensions.gen_random_bytes(10);
    v_token := '';
    for i in 0..9 loop
      v_token := v_token || substr(v_alphabet, (get_byte(v_bytes, i) % length(v_alphabet)) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.orders where qr_token = v_token);
  end loop;
  return v_token;
end $$;

create function public.create_order(
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
  v_customer uuid;
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
  -- A retry of a request that already succeeded returns the same order.
  select * into v_order from public.orders where request_id = p_request_id;
  if found then
    return v_order;
  end if;

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
  if p_type = 'tekpe' and (v_phone is null or v_name is null) then
    raise exception 'TEKPE_NEEDS_CUSTOMER';
  end if;
  if v_phone is not null and v_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'INVALID_PHONE';
  end if;

  -- Lock products in a stable order so concurrent checkouts can't deadlock.
  perform 1 from public.products
  where id in (select (e ->> 'product_id')::uuid from jsonb_array_elements(p_items) e)
  order by id
  for update;
  if exists (
    select 1 from jsonb_array_elements(p_items) e
    where not exists (
      select 1 from public.products p where p.id = (e ->> 'product_id')::uuid and not p.is_archived
    )
  ) then
    raise exception 'PRODUCT_NOT_FOUND';
  end if;

  if v_phone is not null then
    insert into public.customers (phone, name) values (v_phone, v_name)
    on conflict (phone) do update set name = coalesce(excluded.name, public.customers.name)
    returning id into v_customer;
  end if;

  insert into public.orders (request_id, qr_token, customer_id, seller_id, type, destination, payment_method, status)
  values (p_request_id, public.generate_qr_token(), v_customer, v_uid, p_type, v_dest, p_payment_method,
          case when p_type = 'store' then 'completed'::public.order_status else 'new'::public.order_status end)
  on conflict (request_id) do nothing
  returning * into v_order;
  if v_order.id is null then
    -- A concurrent call with the same request id won the race.
    select * into v_order from public.orders where request_id = p_request_id;
    return v_order;
  end if;

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
    values (v_order.id, v_item.product_id, v_item.barcode, v_item.name, v_item.photo_path, v_price, v_item.is_wholesale,
            v_item.cost_price, v_item.weight_g, v_item.qty, v_price * v_item.qty, v_item.weight_g * v_item.qty);
    update public.products set stock = stock - v_item.qty where id = v_item.product_id;
    insert into public.stock_movements (product_id, kind, qty_change, order_id, user_id)
    values (v_item.product_id, 'sale', -v_item.qty, v_order.id, v_uid);

    v_line_count := v_line_count + 1;
    v_item_count := v_item_count + v_item.qty;
    v_weight := v_weight + v_item.weight_g * v_item.qty;
    v_subtotal := v_subtotal + v_price * v_item.qty;
    v_cost := v_cost + v_item.cost_price * v_item.qty;
  end loop;

  -- Mirrors computeShipping in src/lib/domain/shipping.ts — keep both in sync.
  select * into v_settings from public.app_settings;
  if v_dest = 'KR' then
    v_ship_krw := v_settings.kr_shipping_krw;
  elsif v_dest = 'UZ' then
    v_ship_kg := greatest(1, ceil(v_weight / 1000.0)::integer);
    v_ship_usd := v_ship_kg * v_settings.uz_shipping_usd_per_kg;
  end if;

  update public.orders set
    line_count = v_line_count, item_count = v_item_count, total_weight_g = v_weight,
    subtotal = v_subtotal, cost_total = v_cost,
    shipping_krw = v_ship_krw, shipping_usd = v_ship_usd, shipping_kg = v_ship_kg
  where id = v_order.id
  returning * into v_order;
  return v_order;
end $$;

create function public.cancel_order(p_order_id uuid) returns public.orders
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

  for v_item in
    select product_id, sum(qty)::integer as qty from public.order_items
    where order_id = p_order_id group by product_id order by product_id
  loop
    update public.products set stock = stock + v_item.qty where id = v_item.product_id;
    insert into public.stock_movements (product_id, kind, qty_change, order_id, user_id)
    values (v_item.product_id, 'cancel', v_item.qty, p_order_id, v_uid);
  end loop;

  update public.orders set status = 'cancelled', cancelled_at = now(), cancelled_by = v_uid
  where id = p_order_id
  returning * into v_order;
  return v_order;
end $$;

create function public.set_order_status(p_order_id uuid, p_status public.order_status) returns public.orders
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_pos_role();
  v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;
  if not ((v_order.status = 'new' and p_status = 'ready') or (v_order.status = 'ready' and p_status = 'picked_up')) then
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

create function public.restock_product(p_product_id uuid, p_qty integer, p_cost_price integer default null)
returns public.products
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_pos_role();
  v_product public.products;
begin
  if p_qty is null or p_qty < 1 then
    raise exception 'INVALID_QTY';
  end if;
  update public.products
  set stock = stock + p_qty, cost_price = coalesce(p_cost_price, cost_price)
  where id = p_product_id
  returning * into v_product;
  if not found then
    raise exception 'PRODUCT_NOT_FOUND';
  end if;
  insert into public.stock_movements (product_id, kind, qty_change, cost_price, user_id)
  values (p_product_id, 'restock', p_qty, v_product.cost_price, v_uid);
  return v_product;
end $$;

create function public.adjust_stock(p_product_id uuid, p_new_stock integer) returns public.products
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_pos_role();
  v_product public.products;
  v_old integer;
begin
  if p_new_stock is null or p_new_stock < 0 then
    raise exception 'INVALID_STOCK';
  end if;
  select * into v_product from public.products where id = p_product_id for update;
  if not found then
    raise exception 'PRODUCT_NOT_FOUND';
  end if;
  if v_product.stock = p_new_stock then
    return v_product;
  end if;
  v_old := v_product.stock;
  update public.products set stock = p_new_stock where id = p_product_id returning * into v_product;
  insert into public.stock_movements (product_id, kind, qty_change, user_id)
  values (p_product_id, 'adjust', p_new_stock - v_old, v_uid);
  return v_product;
end $$;

revoke all on function public.require_pos_role() from public, anon, authenticated;
revoke all on function public.generate_qr_token() from public, anon, authenticated;
revoke all on function public.create_order(uuid, jsonb, text, text, public.payment_method, public.order_type, public.destination) from public, anon;
revoke all on function public.cancel_order(uuid) from public, anon;
revoke all on function public.set_order_status(uuid, public.order_status) from public, anon;
revoke all on function public.restock_product(uuid, integer, integer) from public, anon;
revoke all on function public.adjust_stock(uuid, integer) from public, anon;
grant execute on function public.create_order(uuid, jsonb, text, text, public.payment_method, public.order_type, public.destination) to authenticated;
grant execute on function public.cancel_order(uuid) to authenticated;
grant execute on function public.set_order_status(uuid, public.order_status) to authenticated;
grant execute on function public.restock_product(uuid, integer, integer) to authenticated;
grant execute on function public.adjust_stock(uuid, integer) to authenticated;
