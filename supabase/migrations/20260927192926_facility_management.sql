alter table public.facilities
  add column if not exists is_archived boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'facilities'
      and policyname = 'public can insert facilities'
  ) then
    create policy "public can insert facilities"
      on public.facilities
      for insert
      to anon, authenticated
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'facilities'
      and policyname = 'public can update facilities'
  ) then
    create policy "public can update facilities"
      on public.facilities
      for update
      to anon, authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'facilities'
  ) then
    alter publication supabase_realtime add table public.facilities;
  end if;
end
$$;
