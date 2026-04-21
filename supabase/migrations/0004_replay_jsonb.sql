-- PostgREST caps row-returning RPCs at 1000 rows. For the replay features we
-- need tens of thousands of position rows in a single call, so return a JSONB
-- blob instead — that's one row and the whole dataset.

create or replace function public.positions_last_hour_json()
returns jsonb
language sql
stable
as $$
  select coalesce(
    jsonb_object_agg(train_id, positions),
    '{}'::jsonb
  )
  from (
    select
      train_id,
      jsonb_agg(
        jsonb_build_object(
          'lat', lat,
          'lon', lon,
          't', extract(epoch from snapshot_at)::bigint
        )
        order by snapshot_at
      ) as positions
    from public.train_positions
    where snapshot_at > now() - interval '1 hour'
    group by train_id
  ) t;
$$;

grant execute on function public.positions_last_hour_json() to anon, authenticated;

-- Per-train variant — returns array of {lat, lon, t} ordered by time.
create or replace function public.positions_for_train_json(p_train_id text)
returns jsonb
language sql
stable
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'lat', lat,
        'lon', lon,
        't', extract(epoch from snapshot_at)::bigint
      )
      order by snapshot_at
    ),
    '[]'::jsonb
  )
  from public.train_positions
  where train_id = p_train_id
    and snapshot_at > now() - interval '1 hour';
$$;

grant execute on function public.positions_for_train_json(text) to anon, authenticated;
