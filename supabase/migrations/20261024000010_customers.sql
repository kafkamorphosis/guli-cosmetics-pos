-- Mijozlar. Per-client totals are aggregated here with the same scope as Statistika: a seller only
-- ever gets clients they sold to and their own numbers, whatever seller id the browser sends.

-- Clients with at least one order in scope. spent = goods + Korean shipping (₩); USD shipping apart.
create function public.customer_stats(p_seller uuid default null, p_customer uuid default null)
returns table (
  id uuid,
  phone text,
  name text,
  created_at timestamptz,
  orders bigint,
  items bigint,
  spent bigint,
  shipping_usd numeric,
  tekpe_orders bigint,
  last_order_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_seller uuid := public.analytics_scope(p_seller);
begin
  return query
  select c.id, c.phone, c.name, c.created_at,
         count(o.id) filter (where o.status <> 'cancelled'),
         coalesce(sum(o.item_count) filter (where o.status <> 'cancelled'), 0)::bigint,
         coalesce(sum(o.subtotal + o.shipping_krw) filter (where o.status <> 'cancelled'), 0)::bigint,
         coalesce(sum(o.shipping_usd) filter (where o.status <> 'cancelled'), 0)::numeric,
         count(o.id) filter (where o.status <> 'cancelled' and o.type = 'tekpe'),
         max(o.created_at) filter (where o.status <> 'cancelled')
  from public.customers c
  join public.orders o on o.customer_id = c.id
  where (v_seller is null or o.seller_id = v_seller)
    and (p_customer is null or c.id = p_customer)
  group by c.id
  order by max(o.created_at) desc;
end $$;

-- Owners rename anyone; sellers only clients they have sold to.
create function public.rename_customer(p_customer uuid, p_name text) returns public.customers
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_pos_role();
  v_name text := nullif(trim(p_name), '');
  v_customer public.customers;
begin
  if length(v_name) > 120 then
    raise exception 'NAME_TOO_LONG';
  end if;
  if public.app_role() = 'seller'
     and not exists (select 1 from public.orders where customer_id = p_customer and seller_id = v_uid) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  update public.customers set name = v_name where id = p_customer returning * into v_customer;
  if v_customer.id is null then
    raise exception 'CUSTOMER_NOT_FOUND';
  end if;
  return v_customer;
end $$;

revoke all on function public.customer_stats(uuid, uuid) from public, anon;
revoke all on function public.rename_customer(uuid, text) from public, anon;
grant execute on function public.customer_stats(uuid, uuid) to authenticated;
grant execute on function public.rename_customer(uuid, text) to authenticated;
