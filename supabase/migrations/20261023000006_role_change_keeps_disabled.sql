-- A role granted for the first time activates the profile (admin API writes app_metadata after the
-- insert). A later role change keeps whatever is_active the admin set: it must never re-enable a
-- disabled account.
create or replace function public.handle_user_role_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_role text := new.raw_app_meta_data ->> 'role';
  v_old text := old.raw_app_meta_data ->> 'role';
begin
  if v_role in ('admin', 'owner', 'seller') and v_role is distinct from v_old then
    update public.profiles
    set role = v_role::public.app_role,
        is_active = case when v_old is null then true else is_active end
    where id = new.id;
  end if;
  return new;
end $$;

revoke all on function public.handle_user_role_change() from public, anon, authenticated;
