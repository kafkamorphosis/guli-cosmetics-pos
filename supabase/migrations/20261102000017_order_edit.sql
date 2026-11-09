-- Managers correct a finished order's client (phone, name) and payment method. Items, prices and
-- stock are never touched.
create function public.update_order_info(p_order_id uuid, p_phone text, p_name text, p_payment public.payment_method)
returns public.orders
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_pos_role();
  v_order public.orders;
  v_phone text := nullif(trim(p_phone), '');
  v_name text := nullif(trim(p_name), '');
  v_customer uuid;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;
  if v_order.status = 'cancelled' then
    raise exception 'ORDER_CANCELLED';
  end if;
  if v_phone is not null and v_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'INVALID_PHONE';
  end if;
  if length(v_name) > 120 then
    raise exception 'NAME_TOO_LONG';
  end if;
  if v_order.type = 'tekpe' and (v_phone is null or v_name is null) then
    raise exception 'TEKPE_NEEDS_CUSTOMER';
  end if;
  if v_order.payment_method = 'credit' and p_payment <> 'credit' and v_order.paid_krw > 0 then
    raise exception 'CREDIT_HAS_PAYMENTS';
  end if;

  -- The name belongs to the client (one per phone), so it changes on their other orders too.
  v_customer := public.upsert_customer(v_phone, v_name);
  update public.orders set customer_id = v_customer, payment_method = p_payment
  where id = p_order_id
  returning * into v_order;
  return v_order;
end $$;

revoke all on function public.update_order_info(uuid, text, text, public.payment_method) from public, anon;
grant execute on function public.update_order_info(uuid, text, text, public.payment_method) to authenticated;
