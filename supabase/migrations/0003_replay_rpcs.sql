-- RPCs for the replay features. Needed because PostgREST caps REST-style
-- .select() queries at 1000 rows by default, and we need every position in
-- the last hour for 150+ trains (tens of thousands of rows).

create or replace function public.positions_last_hour()
returns table (
  train_id text,
  lat double precision,
  lon double precision,
  snapshot_at timestamptz
)
language sql
stable
as $$
  select train_id, lat, lon, snapshot_at
  from public.train_positions
  where snapshot_at > now() - interval '1 hour'
  order by train_id, snapshot_at;
$$;

grant execute on function public.positions_last_hour() to anon, authenticated;

-- Per-train variant, same idea (avoids 1000-row cap on a very long run).
create or replace function public.positions_for_train(p_train_id text)
returns table (
  lat double precision,
  lon double precision,
  snapshot_at timestamptz
)
language sql
stable
as $$
  select lat, lon, snapshot_at
  from public.train_positions
  where train_id = p_train_id
    and snapshot_at > now() - interval '1 hour'
  order by snapshot_at;
$$;

grant execute on function public.positions_for_train(text) to anon, authenticated;
