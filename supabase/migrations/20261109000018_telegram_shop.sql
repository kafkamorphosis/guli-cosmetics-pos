-- Telegram shop (Mini App). Customers order from the shop bot; the order lands in the POS as a
-- pending Tekpe order of the "Telegram doʻkon" account, which a manager approves like a seller
-- order. Unlike seller orders it ships on its own (per-order shipping, no box). The customer gets a
-- Telegram message when the order is approved, packed, picked up by Tekpe or cancelled.
-- Every function here is for the Next.js server only (service role): the browser never calls them.

alter table public.app_secrets
  add column shop_bot_token text,
  add column shop_webhook_secret text;

alter table public.orders
  add column source text not null default 'pos' check (source in ('pos', 'telegram')),
  add column telegram_user_id bigint;
create index orders_telegram_user_idx on public.orders (telegram_user_id, created_at desc) where telegram_user_id is not null;

-- The account that owns shop orders. It has no password and is banned, so nobody can sign in as it;
-- it only gives shop orders a seller (orders.seller_id is required everywhere).
-- Token columns are '' rather than NULL: Supabase Auth fails to list users with NULL tokens.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data,
                        confirmation_token, recovery_token, email_change, email_change_token_new,
                        banned_until, created_at, updated_at)
values ('00000000-0000-4000-8000-00000000c0de', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'telegram@gulicosmetics.local',
        jsonb_build_object('username', 'telegram', 'full_name', 'Telegram doʻkon'),
        jsonb_build_object('provider', 'email', 'role', 'seller'),
        '', '', '', '',
        '2999-01-01 00:00:00+00', now(), now())
on conflict (id) do nothing;

create function public.shop_account() returns uuid
language sql immutable set search_path = '' as $$
  select '00000000-0000-4000-8000-00000000c0de'::uuid
$$;

-- Catalog for customers: no cost, no wholesale price, only whether it is in stock.
create function public.shop_catalog(p_query text default null, p_limit integer default 60, p_offset integer default 0)
returns table (id uuid, name text, photo_path text, retail_price integer, weight_g integer, in_stock boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_q text := nullif(trim(replace(replace(coalesce(p_query, ''), '%', ''), '_', '')), '');
begin
  return query
  select p.id, p.name, p.photo_path, p.retail_price, p.weight_g, p.stock > 0
  from public.products p
  where not p.is_archived and p.retail_price > 0 and (v_q is null or p.name ilike '%' || v_q || '%')
  order by (p.stock > 0) desc, p.name
  limit greatest(1, least(coalesce(p_limit, 60), 200)) offset greatest(coalesce(p_offset, 0), 0);
end $$;

create function public.submit_shop_order(
  p_request_id uuid,
  p_telegram_user_id bigint,
  p_items jsonb,
  p_customer_phone text,
  p_customer_name text,
  p_city text,
  p_district text,
  p_destination public.destination
) returns public.orders
language plpgsql security definer set search_path = '' as $$
declare
  v_order public.orders;
  v_phone text := nullif(trim(p_customer_phone), '');
  v_name text := nullif(trim(p_customer_name), '');
  v_city text := nullif(trim(p_city), '');
  v_district text := nullif(trim(p_district), '');
begin
  if p_telegram_user_id is null then
    raise exception 'NOT_AUTHORIZED';
  end if;
  select * into v_order from public.orders where request_id = p_request_id;
  if found then
    if v_order.telegram_user_id is distinct from p_telegram_user_id then
      raise exception 'NOT_AUTHORIZED';
    end if;
    return v_order;
  end if;
  perform public.check_order_input(p_items, 'tekpe', p_destination, v_phone, v_name);
  if v_city is null or v_district is null then
    raise exception 'TEKPE_NEEDS_ADDRESS';
  end if;
  if (select count(*) from public.orders where telegram_user_id = p_telegram_user_id and status = 'pending') >= 5 then
    raise exception 'TOO_MANY_PENDING';
  end if;
  perform public.lock_order_products(array(select distinct (e ->> 'product_id')::uuid from jsonb_array_elements(p_items) e));
  -- Customers can't order what isn't on the shelf (staff may still oversell from Kassa).
  if exists (
    select 1
    from (select (e ->> 'product_id')::uuid as pid, sum((e ->> 'qty')::integer) as qty
          from jsonb_array_elements(p_items) e group by 1) x
    join public.products p on p.id = x.pid
    where p.stock < x.qty
  ) then
    raise exception 'OUT_OF_STOCK';
  end if;

  -- Customers always pay retail; the manager agrees the payment and can change the method later.
  insert into public.orders (request_id, qr_token, customer_id, seller_id, type, destination, payment_method, status,
                             ship_city, ship_district, source, telegram_user_id)
  values (p_request_id, public.generate_qr_token(), public.upsert_customer(v_phone, left(v_name, 120)), public.shop_account(),
          'tekpe', p_destination, 'transfer', 'pending', left(v_city, 120), left(v_district, 120), 'telegram', p_telegram_user_id)
  on conflict (request_id) do nothing
  returning * into v_order;
  if v_order.id is null then
    select * into v_order from public.orders where request_id = p_request_id;
    return v_order;
  end if;

  v_order := public.place_order_lines(
    v_order.id,
    (select jsonb_agg(jsonb_build_object('product_id', e -> 'product_id', 'qty', e -> 'qty', 'is_wholesale', false))
     from jsonb_array_elements(p_items) e),
    false, public.shop_account(), true);
  perform public.notify_telegram('tekpe_order', public.tekpe_alert_text(v_order));
  return v_order;
end $$;

create function public.shop_my_orders(p_telegram_user_id bigint, p_limit integer default 30) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(public.seller_order_json(o, true) order by o.created_at desc), '[]'::jsonb)
  from (
    select * from public.orders
    where telegram_user_id = p_telegram_user_id
    order by created_at desc
    limit greatest(1, least(coalesce(p_limit, 30), 100))
  ) o
$$;

-- Approve: shop orders ship on their own, so they never go into a seller box.
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
         box_id = case when v_order.source = 'telegram' then null
                       else public.open_box_for(v_order.seller_id, v_order.destination) end
  where id = p_order_id
  returning * into v_order;
  return v_order;
end $$;

-- Tells a shop customer what happened to their order, through the shop bot.
create function public.orders_shop_customer_alert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_token text;
  v_no text := '#' || lpad(new.order_no::text, 6, '0');
  v_text text;
begin
  if new.telegram_user_id is null or new.status is not distinct from old.status then
    return new;
  end if;
  v_text := case new.status
    when 'new' then '✅ Buyurtmangiz ' || v_no || ' tasdiqlandi. Tez orada qadoqlab yuboramiz.'
    when 'ready' then '📦 Buyurtmangiz ' || v_no || ' qadoqlandi va joʻnatishga tayyor.'
    when 'picked_up' then '🚚 Buyurtmangiz ' || v_no || ' pochtaga topshirildi.'
    when 'cancelled' then '❌ Buyurtmangiz ' || v_no || ' bekor qilindi. Savolingiz boʻlsa, shu yerga yozing.'
    else null end;
  select shop_bot_token into v_token from public.app_secrets;
  if v_text is not null and v_token is not null then
    perform net.http_post(
      url := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
      body := jsonb_build_object('chat_id', new.telegram_user_id, 'text', v_text, 'disable_web_page_preview', true)
    );
  end if;
  return new;
end $$;

create trigger orders_shop_customer_alert
  after update of status on public.orders
  for each row execute function public.orders_shop_customer_alert();

revoke all on function public.shop_account() from public, anon, authenticated;
revoke all on function public.shop_catalog(text, integer, integer) from public, anon, authenticated;
revoke all on function public.submit_shop_order(uuid, bigint, jsonb, text, text, text, text, public.destination) from public, anon, authenticated;
revoke all on function public.shop_my_orders(bigint, integer) from public, anon, authenticated;
revoke all on function public.orders_shop_customer_alert() from public, anon, authenticated;
grant execute on function public.shop_catalog(text, integer, integer) to service_role;
grant execute on function public.submit_shop_order(uuid, bigint, jsonb, text, text, text, text, public.destination) to service_role;
grant execute on function public.shop_my_orders(bigint, integer) to service_role;
