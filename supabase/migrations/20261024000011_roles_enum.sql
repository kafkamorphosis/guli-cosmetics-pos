-- Role and status names for the manager/seller split. Behaviour is unchanged here: no account has
-- the old 'owner' role, and the bodies below only swap 'owner' for 'manager'. The new 'pending'
-- value must be committed before later migrations can use it.

alter type public.app_role rename value 'owner' to 'manager';
alter type public.order_status add value if not exists 'pending' before 'new';

alter table public.orders
  add column approved_at timestamptz,
  add column approved_by uuid constraint orders_approved_by_fkey references public.profiles (id);

-- Policies follow the rename on their own (they store the enum value). PL/pgSQL bodies that spell
-- the old name are re-created.
create or replace function public.require_pos_role() returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(public.app_role() in ('manager', 'seller'), false) is false then
    raise exception 'NOT_AUTHORIZED';
  end if;
  return auth.uid();
end $$;

create or replace function public.analytics_scope(p_seller uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_role public.app_role := public.app_role();
begin
  if v_role = 'seller' then
    return auth.uid();
  elsif v_role = 'manager' then
    return p_seller;
  end if;
  raise exception 'NOT_AUTHORIZED';
end $$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_role text := new.raw_app_meta_data ->> 'role';
begin
  insert into public.profiles (id, username, full_name, role, is_active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    case when v_role in ('admin', 'manager', 'seller') then v_role::public.app_role else 'seller' end,
    coalesce(v_role in ('admin', 'manager', 'seller'), false)
  );
  return new;
end $$;

create or replace function public.handle_user_role_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_role text := new.raw_app_meta_data ->> 'role';
  v_old text := old.raw_app_meta_data ->> 'role';
begin
  if v_role in ('admin', 'manager', 'seller') and v_role is distinct from v_old then
    update public.profiles
    set role = v_role::public.app_role,
        is_active = case when v_old is null then true else is_active end
    where id = new.id;
  end if;
  return new;
end $$;

revoke all on function public.require_pos_role() from public, anon, authenticated;
revoke all on function public.analytics_scope(uuid) from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.handle_user_role_change() from public, anon, authenticated;
