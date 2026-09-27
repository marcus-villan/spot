alter table public.reports
  drop constraint if exists reports_status_check;

alter table public.reports
  add constraint reports_status_check
  check (status = any (array['Pending', 'In Progress', 'Resolved', 'Archived']::text[]));
