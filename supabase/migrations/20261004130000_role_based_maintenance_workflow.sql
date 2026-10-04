-- Extends the live SPOT schema verified in the linked Supabase project.
-- Existing profiles and legacy reports are retained; legacy statuses are normalized.

alter table public.profiles alter column role set default 'USER';
alter table public.profiles drop constraint if exists profiles_role_check;
update public.profiles set role = case lower(role)
  when 'student' then 'USER' when 'faculty' then 'USER'
  when 'maintenance' then 'MAINTENANCE' when 'admin' then 'ADMIN' else role end;
alter table public.profiles add constraint profiles_role_check
  check (role in ('USER', 'MAINTENANCE', 'ADMIN'));

create or replace function public.create_spot_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name, email, role)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)), new.email, 'USER')
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created_spot_profile on auth.users;
create trigger on_auth_user_created_spot_profile after insert or update of email on auth.users
for each row execute function public.create_spot_profile();

alter table public.reports
  add column if not exists category text not null default 'Other',
  add column if not exists priority text not null default 'NORMAL',
  add column if not exists attachment_urls text[] not null default '{}',
  add column if not exists assigned_to uuid references public.profiles(id),
  add column if not exists resolution_notes text;

alter table public.reports drop constraint if exists reports_status_check;
update public.reports set status = case status
  when 'Pending' then 'SUBMITTED'
  when 'In Progress' then 'IN_PROGRESS'
  when 'Resolved' then 'RESOLVED'
  when 'Archived' then 'CLOSED'
  else status end;
alter table public.reports add constraint reports_status_check
  check (status in ('SUBMITTED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'));
alter table public.reports drop constraint if exists reports_priority_check;
alter table public.reports add constraint reports_priority_check
  check (priority in ('LOW', 'NORMAL', 'HIGH', 'URGENT'));

create table if not exists public.report_activity (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  event_type text not null,
  from_status text,
  to_status text,
  note text,
  created_at timestamptz not null default now()
);

create or replace function public.spot_has_role(allowed_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = any (allowed_roles));
$$;
revoke all on function public.spot_has_role(text[]) from public, anon;
grant execute on function public.spot_has_role(text[]) to authenticated;

create or replace function public.record_spot_report_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.report_activity(report_id, actor_id, event_type, to_status)
    values (new.id, new.user_id, 'REPORT_CREATED', new.status);
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into public.report_activity(report_id, actor_id, event_type, from_status, to_status)
    values (new.id, auth.uid(), 'STATUS_CHANGED', old.status, new.status);
  end if;
  if new.assigned_to is distinct from old.assigned_to then
    insert into public.report_activity(report_id, actor_id, event_type, note)
    values (new.id, auth.uid(), 'REPORT_ASSIGNED', new.assigned_to::text);
  end if;
  return new;
end;
$$;

create or replace function public.enforce_spot_status_transition()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status is not distinct from old.status then return new; end if;
  if old.status = 'SUBMITTED' and new.status = 'ACKNOWLEDGED' and public.spot_has_role(array['MAINTENANCE','ADMIN']) then return new; end if;
  if old.status = 'ACKNOWLEDGED' and new.status = 'IN_PROGRESS' and public.spot_has_role(array['MAINTENANCE','ADMIN']) then return new; end if;
  if old.status = 'IN_PROGRESS' and new.status = 'RESOLVED' and public.spot_has_role(array['MAINTENANCE','ADMIN']) then return new; end if;
  if old.status = 'RESOLVED' and new.status = 'CLOSED' and public.spot_has_role(array['ADMIN']) then return new; end if;
  raise exception 'Unauthorized or invalid report status transition: % -> %', old.status, new.status using errcode = '42501';
end;
$$;
drop trigger if exists spot_report_status_transition on public.reports;
create trigger spot_report_status_transition before update of status on public.reports
for each row execute function public.enforce_spot_status_transition();
drop trigger if exists spot_report_activity_after_insert on public.reports;
drop trigger if exists spot_report_activity_after_update on public.reports;
create trigger spot_report_activity_after_insert after insert on public.reports
for each row execute function public.record_spot_report_activity();
create trigger spot_report_activity_after_update after update of status, assigned_to on public.reports
for each row execute function public.record_spot_report_activity();

insert into public.report_activity (report_id, actor_id, event_type, to_status, created_at)
select r.id, r.user_id, 'REPORT_CREATED', 'SUBMITTED', r.created_at
from public.reports r
where not exists (select 1 from public.report_activity a where a.report_id = r.id and a.event_type = 'REPORT_CREATED');

-- Replace all existing permissive policies on app data with role/ownership policies.
do $$ declare pol record;
begin
  for pol in select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public' and tablename in ('profiles','reports','facilities','forum_updates','report_activity')
  loop execute format('drop policy %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename); end loop;
end $$;

alter table public.profiles enable row level security;
alter table public.reports enable row level security;
alter table public.facilities enable row level security;
alter table public.forum_updates enable row level security;
alter table public.report_activity enable row level security;

create policy profiles_read_self_or_admin on public.profiles for select to authenticated
using (id = (select auth.uid()) or public.spot_has_role(array['ADMIN']));
create policy profiles_update_admin on public.profiles for update to authenticated
using (public.spot_has_role(array['ADMIN'])) with check (public.spot_has_role(array['ADMIN']));
create policy reports_read_owner_or_staff on public.reports for select to authenticated
using (user_id = (select auth.uid()) or public.spot_has_role(array['MAINTENANCE','ADMIN']));
create policy reports_create_owner on public.reports for insert to authenticated
with check (user_id = (select auth.uid()) and status = 'SUBMITTED');
create policy reports_update_staff on public.reports for update to authenticated
using (public.spot_has_role(array['MAINTENANCE','ADMIN']))
with check (public.spot_has_role(array['MAINTENANCE','ADMIN']));
create policy facilities_read_authenticated on public.facilities for select to authenticated using (true);
create policy facilities_write_staff on public.facilities for all to authenticated
using (public.spot_has_role(array['MAINTENANCE','ADMIN']))
with check (public.spot_has_role(array['MAINTENANCE','ADMIN']));
create policy forum_updates_read_case_participants on public.forum_updates for select to authenticated
using (exists (select 1 from public.reports r where r.id = report_id));
create policy forum_updates_create_staff on public.forum_updates for insert to authenticated
with check (user_id = (select auth.uid()) and public.spot_has_role(array['MAINTENANCE','ADMIN'])
  and exists (select 1 from public.reports r where r.id = report_id));
create policy activity_read_case_participants on public.report_activity for select to authenticated
using (exists (select 1 from public.reports r where r.id = report_id));

revoke all on public.profiles, public.reports, public.facilities, public.forum_updates, public.report_activity from anon;
revoke all on public.profiles, public.reports, public.facilities, public.forum_updates, public.report_activity from authenticated;
grant select on public.profiles to authenticated;
grant update (role) on public.profiles to authenticated;
grant select on public.reports to authenticated;
grant insert (facility_id, user_id, title, description, status, category, priority, attachment_urls) on public.reports to authenticated;
grant update (status, assigned_to, resolution_notes, updated_at) on public.reports to authenticated;
grant select, insert, update on public.facilities to authenticated;
grant select on public.forum_updates to authenticated;
grant insert (report_id, user_id, message) on public.forum_updates to authenticated;
grant select on public.report_activity to authenticated;

create index if not exists reports_user_created_idx on public.reports (user_id, created_at desc);
create index if not exists reports_work_queue_idx on public.reports (status, priority, created_at desc);
create index if not exists report_activity_report_created_idx on public.report_activity (report_id, created_at);
create index if not exists forum_updates_report_created_idx on public.forum_updates (report_id, created_at desc);

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='reports') then alter publication supabase_realtime add table public.reports; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='forum_updates') then alter publication supabase_realtime add table public.forum_updates; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='report_activity') then alter publication supabase_realtime add table public.report_activity; end if;
end $$;
