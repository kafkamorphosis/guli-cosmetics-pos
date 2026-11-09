-- Products at or below their "kam qoldi" threshold. security_invoker: the caller's RLS applies,
-- so only active owner/seller accounts see rows.
create view public.low_stock_products with (security_invoker = on) as
select * from public.products
where not is_archived and stock <= low_stock_threshold;

revoke all on public.low_stock_products from anon, authenticated;
grant select on public.low_stock_products to authenticated;
