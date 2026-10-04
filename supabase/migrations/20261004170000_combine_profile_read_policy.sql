drop policy if exists profiles_read_self_or_admin on public.profiles;
drop policy if exists profiles_read_staff on public.profiles;
create policy profiles_read_self_or_staff on public.profiles for select to authenticated
using (id = (select auth.uid()) or private.spot_has_role(array['MAINTENANCE','ADMIN']));
