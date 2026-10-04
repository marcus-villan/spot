alter table public.reports alter column status set default 'SUBMITTED';
alter table public.profiles alter column email drop not null;

-- Legacy profile rows predate Supabase Auth; release only an unclaimed email so a
-- matching new Auth account can receive its own profile without losing legacy rows.
create or replace function public.create_spot_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles p set email = null
  where p.email = new.email and p.id <> new.id
    and not exists (select 1 from auth.users u where u.id = p.id);
  insert into public.profiles (id, name, email, role)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)), new.email, 'USER')
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;
revoke all on function public.create_spot_profile() from public, anon, authenticated;
