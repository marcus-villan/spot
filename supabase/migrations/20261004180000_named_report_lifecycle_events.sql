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
    values (new.id, auth.uid(), case new.status
      when 'ACKNOWLEDGED' then 'REPORT_ACKNOWLEDGED'
      when 'RESOLVED' then 'REPORT_RESOLVED'
      when 'CLOSED' then 'REPORT_CLOSED'
      else 'REPORT_STATUS_CHANGED' end, old.status, new.status);
  end if;
  if new.assigned_to is distinct from old.assigned_to then
    insert into public.report_activity(report_id, actor_id, event_type, note)
    values (new.id, auth.uid(), 'REPORT_ASSIGNED', new.assigned_to::text);
  end if;
  return new;
end;
$$;
revoke all on function public.record_spot_report_activity() from public, anon, authenticated;
