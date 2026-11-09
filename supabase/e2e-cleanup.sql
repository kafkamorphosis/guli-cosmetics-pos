-- Removes everything the Playwright smoke test created (barcodes starting with E2E).
-- Run as the postgres role (Supabase SQL editor or MCP execute_sql). Never run against real data you want to keep.
begin;

create temp table e2e_products on commit drop as
  select id from public.products where barcode like 'E2E%';

create temp table e2e_orders on commit drop as
  select distinct order_id as id from public.order_items where product_id in (select id from e2e_products);

delete from public.stock_movements
where product_id in (select id from e2e_products) or order_id in (select id from e2e_orders);
delete from public.order_items where order_id in (select id from e2e_orders);
delete from public.orders where id in (select id from e2e_orders);
delete from public.customers c
where c.name like 'E2E%' and not exists (select 1 from public.orders o where o.customer_id = c.id);
delete from public.products where id in (select id from e2e_products);

commit;
