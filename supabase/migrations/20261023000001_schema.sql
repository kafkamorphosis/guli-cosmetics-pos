-- Guli cosmetics POS — schema, RLS, storage, realtime.
-- All money is integer KRW unless the column name says usd. All weights are integer grams.

create extension if not exists pg_trgm with schema extensions;

create type public.app_role as enum ('admin', 'owner', 'seller');
create type public.order_type as enum ('store', 'tekpe');
create type public.destination as enum ('KR', 'UZ');
create type public.payment_method as enum ('cash', 'card', 'transfer');
create type public.order_status as enum ('completed', 'new', 'ready', 'picked_up', 'cancelled');
create type public.movement_kind as enum ('restock', 'sale', 'cancel', 'adjust');

-- ── Tables ────────────────────────────────────────────────────────────────

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  full_name text not null default '',
  role public.app_role not null default 'seller',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  barcode text not null unique check (length(trim(barcode)) > 0),
  name text not null check (length(trim(name)) > 0),
  photo_path text,
  cost_price integer not null default 0 check (cost_price >= 0),
  retail_price integer not null default 0 check (retail_price >= 0),
  wholesale_price integer not null default 0 check (wholesale_price >= 0),
  weight_g integer not null default 0 check (weight_g >= 0),
  stock integer not null default 0,
  low_stock_threshold integer not null default 10 check (low_stock_threshold >= 0),
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_name_trgm on public.products using gin (name extensions.gin_trgm_ops);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  name text,
  created_at timestamptz not null default now()
);

create sequence public.order_no_seq start 1;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_no bigint not null unique default nextval('public.order_no_seq'),
  request_id uuid not null unique,
  qr_token text not null unique,
  customer_id uuid references public.customers (id),
  seller_id uuid not null,
  type public.order_type not null,
  destination public.destination,
  payment_method public.payment_method not null,
  status public.order_status not null,
  item_count integer not null default 0,
  line_count integer not null default 0,
  total_weight_g integer not null default 0,
  subtotal integer not null default 0,
  cost_total integer not null default 0,
  shipping_krw integer not null default 0,
  shipping_usd numeric(10, 2) not null default 0,
  shipping_kg integer not null default 0,
  ready_at timestamptz,
  ready_by uuid references public.profiles (id),
  picked_up_at timestamptz,
  picked_up_by uuid references public.profiles (id),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint orders_seller_id_fkey foreign key (seller_id) references public.profiles (id),
  constraint orders_destination_matches_type check (
    (type = 'store' and destination is null) or (type = 'tekpe' and destination is not null)
  )
);
alter sequence public.order_no_seq owned by public.orders.order_no;
create index orders_created_at_idx on public.orders (created_at desc);
create index orders_status_idx on public.orders (status);
create index orders_seller_idx on public.orders (seller_id);
create index orders_customer_idx on public.orders (customer_id);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid not null references public.products (id),
  barcode text not null,
  name text not null,
  photo_path text,
  unit_price integer not null,
  is_wholesale boolean not null default false,
  unit_cost integer not null,
  unit_weight_g integer not null,
  qty integer not null check (qty > 0),
  line_total integer not null,
  line_weight_g integer not null
);
create index order_items_order_idx on public.order_items (order_id);
create index order_items_product_idx on public.order_items (product_id);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id),
  kind public.movement_kind not null,
  qty_change integer not null,
  cost_price integer,
  order_id uuid references public.orders (id),
  user_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
create index stock_movements_product_idx on public.stock_movements (product_id, created_at desc);
create index stock_movements_order_idx on public.stock_movements (order_id);

create table public.app_settings (
  id boolean primary key default true check (id),
  kr_shipping_krw integer not null default 4000 check (kr_shipping_krw >= 0),
  uz_shipping_usd_per_kg numeric(10, 2) not null default 10 check (uz_shipping_usd_per_kg >= 0),
  updated_at timestamptz not null default now()
);
insert into public.app_settings default values;

-- ── Helpers & triggers ────────────────────────────────────────────────────

-- Role of the calling user, or null when signed out or disabled.
create function public.app_role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid() and is_active
$$;

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, username, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce((new.raw_user_meta_data ->> 'role')::public.app_role, 'seller')
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();
create trigger app_settings_touch before update on public.app_settings
  for each row execute function public.touch_updated_at();

revoke all on function public.app_role() from public, anon;
grant execute on function public.app_role() to authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.touch_updated_at() from public, anon, authenticated;

-- ── Views ─────────────────────────────────────────────────────────────────

create view public.inventory_summary with (security_invoker = on) as
select
  coalesce(sum(cost_price::bigint * greatest(stock, 0)), 0)::bigint as cost_value,
  coalesce(sum(retail_price::bigint * greatest(stock, 0)), 0)::bigint as retail_value,
  coalesce(sum(wholesale_price::bigint * greatest(stock, 0)), 0)::bigint as wholesale_value
from public.products
where not is_archived;

-- ── Grants ────────────────────────────────────────────────────────────────
-- Start from nothing; writes to orders/order_items/stock_movements/customers go through RPCs only.

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on public.profiles, public.products, public.customers, public.orders,
  public.order_items, public.stock_movements, public.app_settings, public.inventory_summary
  to authenticated;
grant insert (barcode, name, photo_path, cost_price, retail_price, wholesale_price, weight_g, low_stock_threshold)
  on public.products to authenticated;
grant update (name, photo_path, cost_price, retail_price, wholesale_price, weight_g, low_stock_threshold, is_archived)
  on public.products to authenticated;
grant update (full_name, role, is_active) on public.profiles to authenticated;
grant update (kr_shipping_krw, uz_shipping_usd_per_kg) on public.app_settings to authenticated;

-- ── RLS ───────────────────────────────────────────────────────────────────

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.stock_movements enable row level security;
alter table public.app_settings enable row level security;

create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.app_role()) is not null);
create policy profiles_admin_update on public.profiles for update to authenticated
  using ((select public.app_role()) = 'admin') with check ((select public.app_role()) = 'admin');

create policy products_select on public.products for select to authenticated
  using ((select public.app_role()) in ('owner', 'seller'));
create policy products_insert on public.products for insert to authenticated
  with check ((select public.app_role()) in ('owner', 'seller'));
create policy products_update on public.products for update to authenticated
  using ((select public.app_role()) in ('owner', 'seller'))
  with check ((select public.app_role()) in ('owner', 'seller'));

create policy customers_select on public.customers for select to authenticated
  using ((select public.app_role()) in ('owner', 'seller'));
create policy orders_select on public.orders for select to authenticated
  using ((select public.app_role()) in ('owner', 'seller'));
create policy order_items_select on public.order_items for select to authenticated
  using ((select public.app_role()) in ('owner', 'seller'));
create policy stock_movements_select on public.stock_movements for select to authenticated
  using ((select public.app_role()) in ('owner', 'seller'));

create policy app_settings_select on public.app_settings for select to authenticated
  using ((select public.app_role()) is not null);
create policy app_settings_admin_update on public.app_settings for update to authenticated
  using ((select public.app_role()) = 'admin') with check ((select public.app_role()) = 'admin');

-- ── Storage ───────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-photos', 'product-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

create policy product_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'product-photos' and (select public.app_role()) in ('owner', 'seller'));
create policy product_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'product-photos' and (select public.app_role()) in ('owner', 'seller'));
create policy product_photos_update on storage.objects for update to authenticated
  using (bucket_id = 'product-photos' and (select public.app_role()) in ('owner', 'seller'));
create policy product_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'product-photos' and (select public.app_role()) in ('owner', 'seller'));

-- ── Realtime ──────────────────────────────────────────────────────────────

alter publication supabase_realtime add table public.products, public.orders;
