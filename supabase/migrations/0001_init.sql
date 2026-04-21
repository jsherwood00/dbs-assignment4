-- Amtrak Tracker — initial schema
-- Idempotent: safe to re-run.

------------------------------------------------------------------------------
-- trains: worker writes (via service role), everyone reads
------------------------------------------------------------------------------
create table if not exists public.trains (
  id            text primary key,            -- amtraker objectID
  train_num     integer not null,
  route_name    text not null,
  lat           double precision,
  lon           double precision,
  heading       text,
  velocity      double precision,
  status        text,
  origin_code   text,
  dest_code     text,
  stations      jsonb,
  last_updated  timestamptz default now(),
  raw           jsonb
);

create index if not exists trains_route_idx
  on public.trains(route_name);

create index if not exists trains_origin_dest_idx
  on public.trains(origin_code, dest_code);

------------------------------------------------------------------------------
-- saved_pairs: user writes + reads, scoped by RLS
------------------------------------------------------------------------------
create table if not exists public.saved_pairs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  from_code   text not null,
  from_name   text not null,
  to_code     text not null,
  to_name     text not null,
  created_at  timestamptz default now(),
  unique (user_id, from_code, to_code)
);

create index if not exists saved_pairs_user_idx
  on public.saved_pairs(user_id);

------------------------------------------------------------------------------
-- Realtime: add trains to the supabase_realtime publication
-- (Wrapped in DO block so re-running doesn't error if already added.)
------------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'trains'
  ) then
    execute 'alter publication supabase_realtime add table public.trains';
  end if;
end $$;

------------------------------------------------------------------------------
-- RLS
------------------------------------------------------------------------------
alter table public.trains      enable row level security;
alter table public.saved_pairs enable row level security;

-- trains: public read, no write policies (worker uses service role → bypasses RLS)
drop policy if exists "trains readable by all" on public.trains;
create policy "trains readable by all"
  on public.trains
  for select
  using (true);

-- saved_pairs: each user sees and mutates only their own rows
drop policy if exists "users read own pairs"   on public.saved_pairs;
drop policy if exists "users insert own pairs" on public.saved_pairs;
drop policy if exists "users delete own pairs" on public.saved_pairs;

create policy "users read own pairs"
  on public.saved_pairs
  for select
  using (auth.uid() = user_id);

create policy "users insert own pairs"
  on public.saved_pairs
  for insert
  with check (auth.uid() = user_id);

create policy "users delete own pairs"
  on public.saved_pairs
  for delete
  using (auth.uid() = user_id);
