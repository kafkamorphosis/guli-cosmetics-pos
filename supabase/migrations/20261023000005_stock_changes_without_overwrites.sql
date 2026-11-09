-- The inventory stepper sent an absolute stock number computed from what one screen last saw,
-- which could overwrite sales made on other devices. Now:
--   change_stock(id, delta)                 — the ±10 stepper; applied to the current value.
--   adjust_stock(id, new, expected default) — exact edit; refuses when stock moved since it was read.

create function public.change_stock(p_product_id uuid, p_delta integer) returns public.products
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_pos_role();
  v_product public.products;
  v_old integer;
  v_new integer;
begin
  if p_delta is null or p_delta = 0 then
    raise exception 'INVALID_QTY';
  end if;
  select * into v_product from public.products where id = p_product_id for update;
  if not found then
    raise exception 'PRODUCT_NOT_FOUND';
  end if;
  -- Removing stock stops at 0 and never lifts an oversold (negative) count.
  v_old := v_product.stock;
  v_new := greatest(v_old + p_delta, least(v_old, 0));
  if v_new = v_old then
    return v_product;
  end if;
  update public.products set stock = v_new where id = p_product_id returning * into v_product;
  insert into public.stock_movements (product_id, kind, qty_change, user_id)
  values (p_product_id, 'adjust', v_new - v_old, v_uid);
  return v_product;
end $$;

drop function public.adjust_stock(uuid, integer);

create function public.adjust_stock(p_product_id uuid, p_new_stock integer, p_expected_stock integer default null)
returns public.products
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_pos_role();
  v_product public.products;
  v_old integer;
begin
  if p_new_stock is null or p_new_stock < 0 then
    raise exception 'INVALID_STOCK';
  end if;
  select * into v_product from public.products where id = p_product_id for update;
  if not found then
    raise exception 'PRODUCT_NOT_FOUND';
  end if;
  if p_expected_stock is not null and v_product.stock <> p_expected_stock then
    raise exception 'STOCK_CHANGED';
  end if;
  if v_product.stock = p_new_stock then
    return v_product;
  end if;
  v_old := v_product.stock;
  update public.products set stock = p_new_stock where id = p_product_id returning * into v_product;
  insert into public.stock_movements (product_id, kind, qty_change, user_id)
  values (p_product_id, 'adjust', p_new_stock - v_old, v_uid);
  return v_product;
end $$;

revoke all on function public.change_stock(uuid, integer) from public, anon;
revoke all on function public.adjust_stock(uuid, integer, integer) from public, anon;
grant execute on function public.change_stock(uuid, integer) to authenticated;
grant execute on function public.adjust_stock(uuid, integer, integer) to authenticated;
