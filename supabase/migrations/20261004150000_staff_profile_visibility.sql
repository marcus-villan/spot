create policy profiles_read_staff on public.profiles for select to authenticated
using (private.spot_has_role(array['MAINTENANCE','ADMIN']));
