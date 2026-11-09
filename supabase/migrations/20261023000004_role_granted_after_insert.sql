-- The admin API creates the auth user first and writes app_metadata in a second statement,
-- so the insert trigger never sees the role. Apply a role whenever app_metadata.role changes.
-- Only the service role can change app_metadata, so this can't be used to self-promote.
create function public.handle_user_role_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_role text := new.raw_app_meta_data ->> 'role';
begin
  if v_role in ('admin', 'owner', 'seller')
     and v_role is distinct from (old.raw_app_meta_data ->> 'role') then
    update public.profiles set role = v_role::public.app_role, is_active = true where id = new.id;
  end if;
  return new;
end $$;

create trigger on_auth_user_role_changed
  after update of raw_app_meta_data on auth.users
  for each row execute function public.handle_user_role_change();

revoke all on function public.handle_user_role_change() from public, anon, authenticated;

-- One-time repair: accounts created through the admin API before this fix, never banned.
update public.profiles p
set role = (u.raw_app_meta_data ->> 'role')::public.app_role, is_active = true
from auth.users u
where u.id = p.id
  and u.raw_app_meta_data ->> 'role' in ('admin', 'owner', 'seller')
  and not p.is_active
  and u.banned_until is null;
