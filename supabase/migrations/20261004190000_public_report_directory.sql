-- Expose a deliberately limited campus report feed without widening reports RLS.
-- The function returns only structured, approved fields and requires a signed-in user.
create or replace function public.spot_public_report_directory(
  p_search text default null,
  p_facility_id uuid default null,
  p_category text default null,
  p_status text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  facility_id uuid,
  facility_name text,
  room text,
  category text,
  status text,
  priority text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_search is not null and length(btrim(p_search)) > 100 then
    raise exception 'Search text is too long' using errcode = '22023';
  end if;
  if p_category is not null and length(btrim(p_category)) > 64 then
    raise exception 'Category filter is too long' using errcode = '22023';
  end if;
  if p_status is not null and length(btrim(p_status)) > 32 then
    raise exception 'Status filter is too long' using errcode = '22023';
  end if;
  if p_status is not null and btrim(p_status) not in (
    'SUBMITTED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'
  ) then
    raise exception 'Unsupported status filter' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'Limit must be between 1 and 100' using errcode = '22023';
  end if;
  if p_offset is null or p_offset < 0 or p_offset > 50000 then
    raise exception 'Offset is out of range' using errcode = '22023';
  end if;

  return query
  select
    r.id,
    r.facility_id,
    f.name,
    f.room,
    r.category,
    r.status,
    r.priority,
    r.created_at
  from public.reports as r
  join public.facilities as f on f.id = r.facility_id
  where (p_facility_id is null or r.facility_id = p_facility_id)
    and (nullif(btrim(p_category), '') is null or r.category = btrim(p_category))
    and (nullif(btrim(p_status), '') is null or r.status = btrim(p_status))
    and (
      nullif(btrim(p_search), '') is null
      or strpos(
        lower(concat_ws(' ', r.id::text, f.name, f.room, r.category)),
        lower(btrim(p_search))
      ) > 0
    )
  order by r.created_at desc, r.id desc
  limit p_limit
  offset p_offset;
end;
$$;

-- PostgreSQL grants EXECUTE to PUBLIC by default. Keep the RPC available only to
-- authenticated callers; do not change the reports table grants or RLS policies.
revoke all on function public.spot_public_report_directory(text, uuid, text, text, integer, integer)
  from public, anon;
grant execute on function public.spot_public_report_directory(text, uuid, text, text, integer, integer)
  to authenticated;
