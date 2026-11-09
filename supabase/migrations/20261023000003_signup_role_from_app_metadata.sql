-- Roles come only from app_metadata, which only the service role (admin API) can set.
-- A user created any other way (e.g. a public sign-up) gets an inactive profile and no access.
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
    case when v_role in ('admin', 'owner', 'seller') then v_role::public.app_role else 'seller' end,
    coalesce(v_role in ('admin', 'owner', 'seller'), false)
  );
  return new;
end $$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
