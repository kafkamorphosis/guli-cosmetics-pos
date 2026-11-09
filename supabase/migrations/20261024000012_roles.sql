-- Managers run the store; sellers take remote Tekpe orders and never read store tables directly
-- (they would see cost prices). Sellers get their own RPCs in the seller-orders migration.

-- Store RPCs (Kassa, inventory, Tekpe board, cancel, rename client): managers only.
create or replace function public.require_pos_role() returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(public.app_role() = 'manager', false) is false then
    raise exception 'NOT_AUTHORIZED';
  end if;
  return auth.uid();
end $$;

-- Any active staff member (manager or seller).
create function public.require_staff() returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(public.app_role() in ('manager', 'seller'), false) is false then
    raise exception 'NOT_AUTHORIZED';
  end if;
  return auth.uid();
end $$;

revoke all on function public.require_pos_role() from public, anon, authenticated;
revoke all on function public.require_staff() from public, anon, authenticated;

drop policy products_select on public.products;
drop policy products_insert on public.products;
drop policy products_update on public.products;
drop policy customers_select on public.customers;
drop policy orders_select on public.orders;
drop policy order_items_select on public.order_items;
drop policy stock_movements_select on public.stock_movements;

create policy products_select on public.products for select to authenticated
  using ((select public.app_role()) = 'manager');
create policy products_insert on public.products for insert to authenticated
  with check ((select public.app_role()) = 'manager');
create policy products_update on public.products for update to authenticated
  using ((select public.app_role()) = 'manager')
  with check ((select public.app_role()) = 'manager');
create policy customers_select on public.customers for select to authenticated
  using ((select public.app_role()) = 'manager');
create policy orders_select on public.orders for select to authenticated
  using ((select public.app_role()) = 'manager');
create policy order_items_select on public.order_items for select to authenticated
  using ((select public.app_role()) = 'manager');
create policy stock_movements_select on public.stock_movements for select to authenticated
  using ((select public.app_role()) = 'manager');

drop policy product_photos_select on storage.objects;
drop policy product_photos_insert on storage.objects;
drop policy product_photos_update on storage.objects;
drop policy product_photos_delete on storage.objects;

create policy product_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'product-photos' and (select public.app_role()) in ('manager', 'seller'));
create policy product_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'product-photos' and (select public.app_role()) = 'manager');
create policy product_photos_update on storage.objects for update to authenticated
  using (bucket_id = 'product-photos' and (select public.app_role()) = 'manager');
create policy product_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'product-photos' and (select public.app_role()) = 'manager');

-- The two store accounts become managers (the role trigger updates their profiles).
update auth.users u
set raw_app_meta_data = u.raw_app_meta_data || '{"role":"manager"}'
from public.profiles p
where p.id = u.id and p.username in ('zayn', 'abdulaziz') and p.role = 'seller';
