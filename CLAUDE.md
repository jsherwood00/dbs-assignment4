# Amtrak Live Tracker

A live map of every active Amtrak train in the US, updating in real time. Users can favorite specific trains from the map — favorited trains turn green with a crazy red shockwave effect when in motion, so you can spot them at a glance. A "Replay 1 hour" feature time-lapses the entire fleet's last-hour movement in 10 seconds.

Built for MPCS 51238 (Design, Build, Ship) · Week 4 Assignment · Spring 2026.

**Live demo:** https://dbs-assignment4-one.vercel.app

---

## Architecture

```
api.amtraker.com (unofficial community-run Amtrak API)
         ↑ HTTP GET every 15 s
    Railway Worker (Node.js)
         ↓ upsert
   Supabase (Postgres + Auth + Realtime)
         ↓ WebSocket push
     Vercel (Next.js frontend)
         ↓ render
       Browser (live map, animated)
```

**Loose coupling:** the worker never talks to the frontend. The frontend never talks to the worker. Supabase is the connective tissue. If the frontend crashes, the worker keeps polling. If the worker crashes, the frontend keeps showing stale data with a "last updated" indicator.

**Unofficial API caveat:** `api.amtraker.com` is community-maintained by piemadd (not Amtrak). The worker handles errors gracefully — a failed poll logs and the next interval retries.

---

## Monorepo Layout

```
dbs-assignment4/
├── CLAUDE.md                     # this file
├── AGENTS.md                     # copy of CLAUDE.md for cross-tool compatibility
├── .gitignore                    # ignores .env* except .env.example
├── apps/
│   ├── web/                      # Next.js frontend → Vercel
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx          # main map + favorites drawer
│   │   │   ├── login/page.tsx
│   │   │   └── signup/page.tsx
│   │   ├── components/
│   │   │   ├── train-map.tsx     # Leaflet map + live/replay layers
│   │   │   ├── train-figure.ts   # SVG train + popup HTML builders
│   │   │   ├── saved-trains-panel.tsx  # slide-out favorites drawer
│   │   │   ├── trains-context.tsx
│   │   │   ├── auth-context.tsx
│   │   │   ├── nav-bar.tsx
│   │   │   ├── fullscreen-button.tsx
│   │   │   ├── history-slider.tsx
│   │   │   └── freshness-badge.tsx
│   │   ├── lib/
│   │   │   ├── supabase.ts
│   │   │   ├── types.ts
│   │   │   ├── stations.ts
│   │   │   └── heading.ts
│   │   ├── .env.local            # gitignored
│   │   ├── .env.example
│   │   └── package.json
│   └── worker/                   # Node.js worker → Railway
│       ├── index.js              # poll loop
│       ├── parse.js              # amtraker → DB schema mapping
│       ├── nixpacks.toml         # explicit Railway build plan
│       ├── package.json          # type: "module"
│       ├── .env.local            # gitignored
│       └── .env.example
└── supabase/
    └── migrations/
        ├── 0001_init.sql              # trains, saved_pairs, RLS, Realtime
        ├── 0002_train_positions.sql   # history table + trains_at(t) RPC
        ├── 0003_replay_rpcs.sql       # setof RPCs for replay
        ├── 0004_replay_jsonb.sql      # JSONB RPCs (bypass PostgREST row cap)
        └── 0005_saved_trains.sql      # favorites table + RLS
```

---

## Database Schema

### `trains` (worker writes via service role, everyone reads)

```sql
create table public.trains (
  id text primary key,                 -- amtraker trainID
  train_num integer not null,
  route_name text not null,
  lat double precision,
  lon double precision,
  heading text,
  velocity double precision,
  status text,
  origin_code text,
  dest_code text,
  stations jsonb,
  last_updated timestamptz default now(),
  raw jsonb                            -- full amtraker payload
);
```

Realtime enabled on `public.trains` via `alter publication supabase_realtime add table public.trains`.

### `train_positions` (history; 1-hour rolling window)

```sql
create table public.train_positions (
  id bigserial primary key,
  train_id text not null,
  train_num integer,
  route_name text,
  lat double precision,
  lon double precision,
  heading text,
  velocity double precision,
  status text,
  snapshot_at timestamptz not null default now()
);
```

Worker prunes rows older than 1 hour on every tick. RPCs for replay:

- `trains_at(t timestamptz)` — latest snapshot per train on-or-before `t`, 5-min look-back
- `positions_last_hour_json()` — returns a JSONB map `{train_id: [{lat, lon, t}, ...]}` bypassing PostgREST's 1000-row cap
- `positions_for_train_json(p_train_id text)` — same shape for a single train

### `saved_trains` (favorites, RLS-scoped)

```sql
create table public.saved_trains (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  train_id text not null,
  created_at timestamptz default now(),
  unique (user_id, train_id)
);
```

Own-row `select / insert / delete` policies via `auth.uid() = user_id`.

### RLS Summary

- `trains`: public `select`, no insert/update/delete policies (worker uses service role to bypass).
- `train_positions`: public `select`; worker uses service role for inserts/deletes.
- `saved_trains`: own-row `select / insert / delete`.
- `saved_pairs` (from earlier design): still exists, unused.

---

## Environment Variables

### Frontend (`apps/web/.env.local` + Vercel)

```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### Worker (`apps/worker/.env.local` + Railway)

```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
POLL_INTERVAL_MS=15000
```

**Hard rule:** service role key never reaches the browser. `.gitignore` ignores every `.env*` file except `.env.example`.

---

## Features

### Live map

- Leaflet + OpenStreetMap tiles filtered to near-black sci-fi aesthetic (heavy grayscale + brightness + hue-rotate on `.leaflet-tile-pane`).
- SVG locomotive markers, rotated to amtraker's reported compass heading (eased over multiple frames so outlier GPS samples don't flip orientation).
- Rail tracks rendered as cyan dashed polylines, deduplicated per route name.
- Cyan station dots; pulse when a train is currently between `arr` and `dep`.
- Realtime subscription on `public.trains` so markers move the moment Supabase receives a Postgres row UPDATE.

### Train movement animation

- On each realtime update, compares new `(lat, lon)` to the displayed position. If on-the-ground distance exceeds 100 m (~330 ft, well past GPS jitter), starts a 2 s ease-in-out animation.
- "Angry" mode: while animating, markers shift to ember-hot orange with a rumble transform, sooty gray smoke puffs, and a faster glow pulse.

### Favorites (logged-in users)

- Click any train → popup has "★ Favorite this train" button. Toggles `saved_trains` membership via a delegated click handler.
- Favorited trains render in emerald green (`#10e070`) at larger icon size.
- While a favorite is moving, it gets the full crazy treatment: neon green, 3 staggered shockwave rings, crimson smoke, faster pulse, rumble.
- Side-drawer panel slides out from the right edge. "Only show favorites" toggle filters the entire map (markers + tracks + stations) to the user's set.

### Popups

- Route name, train number, status badge.
- Velocity (mph), next station, delay vs. scheduled.
- "GPS updated X ago · HH:MM" using amtraker's upstream `lastValTS` (not our worker's write time).
- Replay last hour + Favorite buttons in the action row.
- Popup auto-closes on Replay-click so the animation isn't blocked.

### History slider

- Scrubs through the last hour at 15 s granularity.
- History mode unsubscribes from Realtime and calls `trains_at(t)` RPC for each position.
- Nav freshness badge flips to gold "HISTORY · X min ago" while scrubbing.

### Replay All (1 hour → 10 seconds)

- One-click button in the slider dock.
- Fetches full hour of positions in a single JSONB RPC (bypasses PostgREST's 1000-row cap).
- Timestamp-based interpolation: each train's cursor advances through its actual samples at the virtual clock, so data gaps play as continuous motion and genuinely-parked trains stay put.
- All live markers are hidden while ghost markers play back, then restored.
- Status pill shows "Replaying · 42/60 min" with a live progress bar.

### Single-train replay

- Button in the train popup.
- Same timestamp-based smooth interpolation, 8 s duration.
- Live marker for that train hides while the replay plays; returns afterward.
- Growing cyan trail shows the traversed route.

### Freshness indicator

- Nav badge: green "LIVE · 12s ago" (<90 s), gold (<5 min), red "NO DATA".
- Computed from `max(last_updated)` across the client's current train set.

### Fullscreen

- Button in the nav. Uses the browser Fullscreen API.

---

## Worker Contract

**File:** `apps/worker/index.js`

1. On startup: immediate fetch + upsert (don't wait for first interval).
2. Every `POLL_INTERVAL_MS` (15 s default): fetch `https://api.amtraker.com/v3/trains`.
3. Amtraker's `/v3/trains` returns `{ "<trainNum>": [ {...train}, {...train} ] }` — flatten array-of-arrays.
4. Parse: `t.trainID` is the stable PK (not `objectID` as the older doc claimed). `t.trainNum` is a string — `parseInt` it.
5. Upsert into `trains` on conflict `id`.
6. Append one row per train into `train_positions` (without `stations` / `raw` to keep rows small).
7. Delete `train_positions` rows older than 1 hour.
8. Catch errors, log, continue — one bad response never kills the process.

---

## Frontend Notes

- Leaflet is dynamically imported with `ssr: false` because it references `window` at module load.
- Canvas renderer (`preferCanvas: true` on `MapContainer`) for the tracks and station dots; stations opt back into SVG so their CSS pulse animation works.
- Marker rotation via a CSS variable (`--rot`), updated on the existing element — never `setIcon()` on heading changes, because that destroys and rebuilds the DOM (visible flicker).
- Replay layers pre-compute all frames upfront so the RAF loop is pure lookups and lerps.
- Tailwind v4 silently purges classes with double-hyphens (`--`) in names, so internal state classes are named with single hyphens (e.g. `is-ghost`, not `train-figure--ghost`).

---

## Deploy

### Frontend → Vercel

1. Import GitHub repo.
2. **Root Directory: `apps/web`** (critical — Next monorepo).
3. Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

### Worker → Railway

1. New Project → Deploy from GitHub.
2. **Root Directory: `apps/worker`**.
3. Env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `POLL_INTERVAL_MS=15000`.
4. If Railpack errors on "build plan": the included `nixpacks.toml` at `apps/worker/` spells out the plan (`node index.js`).

### Supabase

- Add the Vercel URL to Auth → URL Configuration (Site URL + Redirect URLs) so signup/login redirects work.
- Replication on `public.trains` is enabled via SQL (not dashboard), see `supabase/migrations/0001_init.sql`.

---

## Known Gotchas

1. Realtime silently not firing → the `trains` table wasn't added to the `supabase_realtime` publication. Fixed in migration 0001.
2. Worker writes fail silently → anon key used instead of service role. RLS has no worker-write policy.
3. Favorite button does nothing → user not logged in. Button is conditionally rendered server-side of the popup builder.
4. Vercel build fails with monorepo error → Root Directory isn't `apps/web`.
5. Railway worker not starting → missing `"type": "module"` or an explicit build plan (nixpacks.toml).
6. Amtraker field names differ from older docs — `trainID` not `objectID`, `trainState` not `status`.
7. Leaflet SSR errors in Next.js → `dynamic(() => import(...), { ssr: false })`.
8. PostgREST 1000-row cap on RPCs — use JSONB-returning RPCs for larger result sets.

---

## Stretch Goals Implemented

- ✅ Rail tracks overlay (drawn from amtraker station coordinates, deduped per route)
- ✅ Station markers with "train at station" pulse
- ✅ Freshness badge (with history-mode override)
- ✅ 1-hour history slider
- ✅ 1-hour time-lapse replay (all trains at once)
- ✅ Per-train "replay my last hour" animation
- ✅ Favorites with per-user personalization
- ✅ Fullscreen toggle
- ✅ Slide-out drawer for favorites panel
- ✅ "GPS updated X ago" using amtraker upstream timestamp
- ✅ AGENTS.md mirror of this file
