-- Telegram alerts: low stock (once per threshold crossing) and new Tekpe orders. Messages are logged
-- in notification_log and sent from Postgres with pg_net, so they fire whichever device made the change.

create extension if not exists pg_net with schema extensions;

-- Secrets: no client grants at all. Admin server actions read/write them with the service key.
create table public.app_secrets (
  id boolean primary key default true check (id),
  telegram_bot_token text,
  telegram_chat_id text,
  telegram_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.app_secrets default values;
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;

create table public.notification_log (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('low_stock', 'tekpe_order', 'test')),
  text text not null,
  request_id bigint,
  created_at timestamptz not null default now()
);
create index notification_log_created_idx on public.notification_log (created_at desc);
alter table public.notification_log enable row level security;
revoke all on public.notification_log from anon, authenticated;

create function public.html_escape(p text) returns text
language sql immutable set search_path = '' as $$
  select replace(replace(replace(coalesce(p, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;')
$$;

create function public.fmt_krw(p bigint) returns text
language sql immutable set search_path = '' as $$
  select replace(to_char(p, 'FM999,999,999,990'), ',', ' ') || ' ₩'
$$;

create function public.fmt_num(p numeric) returns text
language sql immutable set search_path = '' as $$
  select replace(trim(trailing '.' from trim(trailing '0' from to_char(p, 'FM999999990.00'))), '.', ',')
$$;

-- Logs the message and, when Telegram is configured and enabled, sends it.
create function public.notify_telegram(p_kind text, p_text text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_secrets public.app_secrets;
  v_request bigint;
begin
  select * into v_secrets from public.app_secrets;
  if v_secrets.telegram_enabled and v_secrets.telegram_bot_token is not null and v_secrets.telegram_chat_id is not null then
    v_request := net.http_post(
      url := 'https://api.telegram.org/bot' || v_secrets.telegram_bot_token || '/sendMessage',
      body := jsonb_build_object(
        'chat_id', v_secrets.telegram_chat_id,
        'text', p_text,
        'parse_mode', 'HTML',
        'disable_web_page_preview', true
      )
    );
  end if;
  insert into public.notification_log (kind, text, request_id) values (p_kind, p_text, v_request);
end $$;

create function public.products_low_stock_alert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.stock > old.low_stock_threshold and new.stock <= new.low_stock_threshold and not new.is_archived then
    perform public.notify_telegram(
      'low_stock',
      '⚠️ <b>Kam qoldi:</b> ' || public.html_escape(new.name) || chr(10) ||
      'Omborda: ' || new.stock || ' ta (chegara ' || new.low_stock_threshold || ' ta)'
    );
  end if;
  return new;
end $$;

create trigger products_low_stock_alert
  after update of stock on public.products
  for each row execute function public.products_low_stock_alert();

create function public.tekpe_alert_text(o public.orders) returns text
language sql stable security definer set search_path = '' as $$
  select '📦 <b>Yangi Tekpe #' || lpad(o.order_no::text, 6, '0') || '</b> · ' ||
         case o.destination when 'UZ' then 'Oʻzbekiston' else 'Koreya' end || chr(10) ||
         public.html_escape(coalesce(c.name, '—')) || ' · ' || public.html_escape(coalesce(c.phone, '')) || chr(10) ||
         o.item_count || ' ta · ' || public.fmt_num(o.total_weight_g / 1000.0) || ' kg · ' ||
         public.fmt_krw(o.subtotal + o.shipping_krw) ||
         case when o.shipping_usd > 0 then ' + ' || public.fmt_num(o.shipping_usd) || ' $' else '' end
  from (select 1) one
  left join public.customers c on c.id = o.customer_id
$$;

-- create_order: Phase 1 body unchanged, plus the Tekpe alert at the end.
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

  if p_type = 'tekpe' then
    perform public.notify_telegram('tekpe_order', public.tekpe_alert_text(v_order));
  end if;
  return v_order;
end $$;

revoke all on function public.html_escape(text) from public, anon, authenticated;
revoke all on function public.fmt_krw(bigint) from public, anon, authenticated;
revoke all on function public.fmt_num(numeric) from public, anon, authenticated;
revoke all on function public.notify_telegram(text, text) from public, anon, authenticated;
revoke all on function public.products_low_stock_alert() from public, anon, authenticated;
revoke all on function public.tekpe_alert_text(public.orders) from public, anon, authenticated;
