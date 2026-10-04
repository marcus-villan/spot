-- Keep authorization helpers callable inside RLS without exposing SECURITY DEFINER
-- functions as anonymous RPC endpoints.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.spot_has_role(allowed_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = any (allowed_roles));
$$;
revoke all on function private.spot_has_role(text[]) from public, anon;
grant execute on function private.spot_has_role(text[]) to authenticated;
revoke all on function public.spot_has_role(text[]) from public, anon, authenticated;

revoke all on function public.create_spot_profile() from public, anon, authenticated;
revoke all on function public.enforce_spot_status_transition() from public, anon, authenticated;
revoke all on function public.record_spot_report_activity() from public, anon, authenticated;

drop policy if exists facilities_write_staff on public.facilities;
create policy facilities_insert_staff on public.facilities for insert to authenticated
with check (private.spot_has_role(array['MAINTENANCE','ADMIN']));
create policy facilities_update_staff on public.facilities for update to authenticated
using (private.spot_has_role(array['MAINTENANCE','ADMIN']))
with check (private.spot_has_role(array['MAINTENANCE','ADMIN']));

drop policy if exists profiles_read_self_or_admin on public.profiles;
create policy profiles_read_self_or_admin on public.profiles for select to authenticated
using (id = (select auth.uid()) or private.spot_has_role(array['ADMIN']));
drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles for update to authenticated
using (private.spot_has_role(array['ADMIN'])) with check (private.spot_has_role(array['ADMIN']));
drop policy if exists reports_read_owner_or_staff on public.reports;
create policy reports_read_owner_or_staff on public.reports for select to authenticated
using (user_id = (select auth.uid()) or private.spot_has_role(array['MAINTENANCE','ADMIN']));
drop policy if exists reports_update_staff on public.reports;
create policy reports_update_staff on public.reports for update to authenticated
using (private.spot_has_role(array['MAINTENANCE','ADMIN']))
with check (private.spot_has_role(array['MAINTENANCE','ADMIN']));
drop policy if exists forum_updates_create_staff on public.forum_updates;
create policy forum_updates_create_staff on public.forum_updates for insert to authenticated
with check (user_id = (select auth.uid()) and private.spot_has_role(array['MAINTENANCE','ADMIN'])
  and exists (select 1 from public.reports r where r.id = report_id));

create index if not exists forum_updates_user_id_idx on public.forum_updates(user_id);
create index if not exists report_activity_actor_id_idx on public.report_activity(actor_id);
create index if not exists reports_assigned_to_idx on public.reports(assigned_to);
