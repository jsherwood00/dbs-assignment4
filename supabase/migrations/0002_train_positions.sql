-- History of train positions for the "scrub back in time" slider.
-- Worker appends a row per train per poll; retention is 1 hour.
-- No Realtime subscription on this table — queried on-demand only.

create table if not exists public.train_positions (
  id           bigserial primary key,
  train_id     text not null,
  train_num    integer,
  route_name   text,
  lat          double precision,
  lon          double precision,
  heading      text,
  velocity     double precision,
  status       text,
  snapshot_at  timestamptz not null default now()
);

create index if not exists train_positions_snapshot_idx
  on public.train_positions(snapshot_at desc);

create index if not exists train_positions_train_snapshot_idx
  on public.train_positions(train_id, snapshot_at desc);

alter table public.train_positions enable row level security;

drop policy if exists "train_positions readable by all" on public.train_positions;
create policy "train_positions readable by all"
  on public.train_positions
  for select
  using (true);

-- RPC: return the latest known position for each train on-or-before t,
-- looking back 5 minutes (so we don't show trains that no longer existed).
create or replace function public.trains_at(t timestamptz)
returns table (
  train_id text,
  train_num integer,
  route_name text,
  lat double precision,
  lon double precision,
  heading text,
  velocity double precision,
  status text,
  snapshot_at timestamptz
)
language sql
stable
as $$
  select distinct on (tp.train_id)
    tp.train_id,
    tp.train_num,
    tp.route_name,
    tp.lat,
    tp.lon,
    tp.heading,
    tp.velocity,
    tp.status,
    tp.snapshot_at
  from public.train_positions tp
  where tp.snapshot_at <= t
    and tp.snapshot_at > t - interval '5 minutes'
  order by tp.train_id, tp.snapshot_at desc;
$$;

grant execute on function public.trains_at(timestamptz) to anon, authenticated;
