-- Nasiya: a credit sale owes goods + Korean shipping (₩) until managers record payments that cover it.

alter table public.orders
  add column paid_krw integer not null default 0 check (paid_krw >= 0),
  add column credit_due_krw integer generated always as (
    case when payment_method = 'credit' and status <> 'cancelled'
         then greatest(subtotal + shipping_krw - paid_krw, 0) else 0 end
  ) stored;
create index orders_credit_due_idx on public.orders (created_at desc) where payment_method = 'credit';

create table public.credit_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null constraint credit_payments_order_id_fkey references public.orders (id),
  amount_krw integer not null check (amount_krw > 0),
  paid_at timestamptz not null default now(),
  recorded_by uuid not null constraint credit_payments_recorded_by_fkey references public.profiles (id)
);
create index credit_payments_order_idx on public.credit_payments (order_id, paid_at);
alter table public.credit_payments enable row level security;
revoke all on public.credit_payments from anon, authenticated;
grant select on public.credit_payments to authenticated;
create policy credit_payments_select on public.credit_payments for select to authenticated
  using ((select public.app_role()) = 'manager');

-- Selling on credit needs to know who owes: a client with phone and name.
create function public.orders_credit_needs_customer() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.payment_method = 'credit'
     and (new.customer_id is null or (select c.name from public.customers c where c.id = new.customer_id) is null) then
    raise exception 'NASIYA_NEEDS_CUSTOMER';
  end if;
  return new;
end $$;
create trigger orders_credit_needs_customer
  before insert or update of payment_method, customer_id on public.orders
  for each row execute function public.orders_credit_needs_customer();

create function public.record_credit_payment(p_order_id uuid, p_amount integer) returns public.orders
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_pos_role();
  v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;
  if v_order.payment_method <> 'credit' then
    raise exception 'NOT_CREDIT';
  end if;
  if v_order.status in ('pending', 'cancelled') then
    raise exception 'INVALID_STATUS_TRANSITION';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;
  if p_amount > v_order.credit_due_krw then
    raise exception 'CREDIT_OVERPAY';
  end if;
  insert into public.credit_payments (order_id, amount_krw, recorded_by) values (p_order_id, p_amount, v_uid);
  update public.orders set paid_krw = paid_krw + p_amount where id = p_order_id returning * into v_order;
  return v_order;
end $$;

-- Sellers see what is paid and left on their own orders.
create or replace function public.seller_order_json(o public.orders, p_with_items boolean) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', o.id, 'order_no', o.order_no, 'request_id', o.request_id, 'created_at', o.created_at,
    'status', o.status, 'type', o.type, 'destination', o.destination, 'payment_method', o.payment_method,
    'item_count', o.item_count, 'line_count', o.line_count, 'total_weight_g', o.total_weight_g,
    'subtotal', o.subtotal, 'shipping_krw', o.shipping_krw, 'shipping_usd', o.shipping_usd, 'shipping_kg', o.shipping_kg,
    'paid_krw', o.paid_krw, 'credit_due_krw', o.credit_due_krw,
    'approved_at', o.approved_at, 'ready_at', o.ready_at, 'picked_up_at', o.picked_up_at, 'cancelled_at', o.cancelled_at,
    'ship_city', o.ship_city, 'ship_district', o.ship_district, 'box_id', o.box_id,
    'box_no', b.box_no, 'box_status', b.status,
    'customer', (select jsonb_build_object('name', c.name, 'phone', c.phone) from public.customers c where c.id = o.customer_id)
  ) || case when p_with_items then jsonb_build_object('items', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', i.id, 'barcode', i.barcode, 'name', i.name, 'photo_path', i.photo_path, 'unit_price', i.unit_price,
      'is_wholesale', i.is_wholesale, 'qty', i.qty, 'line_total', i.line_total,
      'unit_weight_g', i.unit_weight_g, 'line_weight_g', i.line_weight_g) order by i.name)
    from public.order_items i where i.order_id = o.id), '[]'::jsonb)) else '{}'::jsonb end
  from (select 1) one
  left join public.boxes b on b.id = o.box_id
$$;

revoke all on function public.orders_credit_needs_customer() from public, anon, authenticated;
revoke all on function public.record_credit_payment(uuid, integer) from public, anon;
grant execute on function public.record_credit_payment(uuid, integer) to authenticated;
