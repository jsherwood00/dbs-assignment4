-- Saved (favorited) trains. A user picks a live train from the map and
-- it shows in red on their view from then on. Keyed on amtraker's stable
-- trainID (e.g. "59-20") which matches public.trains.id.

create table if not exists public.saved_trains (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  train_id    text not null,
  created_at  timestamptz default now(),
  unique (user_id, train_id)
);

create index if not exists saved_trains_user_idx
  on public.saved_trains(user_id);

alter table public.saved_trains enable row level security;

drop policy if exists "users read own saved trains"   on public.saved_trains;
drop policy if exists "users insert own saved trains" on public.saved_trains;
drop policy if exists "users delete own saved trains" on public.saved_trains;

create policy "users read own saved trains"
  on public.saved_trains
  for select
  using (auth.uid() = user_id);

create policy "users insert own saved trains"
  on public.saved_trains
  for insert
  with check (auth.uid() = user_id);

create policy "users delete own saved trains"
  on public.saved_trains
  for delete
  using (auth.uid() = user_id);
