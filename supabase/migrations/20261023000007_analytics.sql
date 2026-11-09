-- Statistika. Aggregation happens here so phones never download every order, and the role scope is
-- enforced here: a seller only ever gets their own sales, whatever seller id the browser sends.

-- Effective seller filter: seller → themselves; owner → the requested seller (null = everyone).
create function public.analytics_scope(p_seller uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_role public.app_role := public.app_role();
begin
  if v_role = 'seller' then
    return auth.uid();
  elsif v_role = 'owner' then
    return p_seller;
  end if;
  raise exception 'NOT_AUTHORIZED';
end $$;

create function public.analytics_report(p_from timestamptz, p_to timestamptz, p_seller uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_seller uuid := public.analytics_scope(p_seller);
  v_result jsonb;
begin
  with o as (
    select * from public.orders
    where status <> 'cancelled'
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
    'cost', t.cost,
    'profit', t.revenue - t.cost,
    'shipping_krw', t.shipping_krw,
    'shipping_usd', t.shipping_usd,
    'by_payment', coalesce((select jsonb_agg(to_jsonb(pay) order by pay.revenue desc) from pay), '[]'::jsonb),
    'products', coalesce((select jsonb_agg(to_jsonb(prod) order by prod.revenue desc, prod.name) from prod), '[]'::jsonb)
  )
  into v_result
  from totals t;
  return v_result;
end $$;

-- Products in stock with the fewest sales over the last p_days days (unsold ones first).
create function public.least_sold(p_days integer, p_seller uuid default null, p_limit integer default 10)
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
    where o.status <> 'cancelled'
      and o.created_at >= now() - make_interval(days => p_days)
      and o.created_at <= now()
      and (v_seller is null or o.seller_id = v_seller)
    group by i.product_id
  ) s on s.pid = p.id
  where not p.is_archived and p.stock > 0
  order by coalesce(s.qty, 0) asc, p.name
  limit greatest(1, least(coalesce(p_limit, 10), 100));
end $$;

revoke all on function public.analytics_scope(uuid) from public, anon, authenticated;
revoke all on function public.analytics_report(timestamptz, timestamptz, uuid) from public, anon;
revoke all on function public.least_sold(integer, uuid, integer) from public, anon;
grant execute on function public.analytics_report(timestamptz, timestamptz, uuid) to authenticated;
grant execute on function public.least_sold(integer, uuid, integer) to authenticated;
