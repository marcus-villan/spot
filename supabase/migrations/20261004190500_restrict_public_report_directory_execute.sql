-- Supabase grants EXECUTE to service_role through schema default privileges.
-- The public directory RPC is intended for authenticated application users only.
revoke all on function public.spot_public_report_directory(text, uuid, text, text, integer, integer)
  from service_role;
grant execute on function public.spot_public_report_directory(text, uuid, text, text, integer, integer)
  to authenticated;
