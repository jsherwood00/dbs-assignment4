import { createClient } from "@supabase/supabase-js";
import { parseTrains } from "./parse.js";

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  POLL_INTERVAL_MS,
  AMTRAKER_URL,
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Set them in the environment (Railway) or apps/worker/.env.local for local dev.",
  );
  process.exit(1);
}

const POLL_URL = AMTRAKER_URL || "https://api.amtraker.com/v3/trains";
const POLL_INTERVAL = Math.max(
  5000,
  parseInt(POLL_INTERVAL_MS || "15000", 10) || 15000,
);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function pollOnce() {
  const startedAt = Date.now();
  try {
    const res = await fetch(POLL_URL, {
      headers: { "user-agent": "amtrak-tracker-worker/0.1" },
    });
    if (!res.ok) {
      throw new Error(`amtraker returned HTTP ${res.status}`);
    }
    const payload = await res.json();

    const rows = parseTrains(payload);
    if (rows.length === 0) {
      console.log(log("warn", "no trains in payload — skipping upsert"));
      return;
    }

    const { error } = await supabase
      .from("trains")
      .upsert(rows, { onConflict: "id" });

    if (error) throw error;

    // Append to the history table for the "scrub back in time" slider.
    // Stations / raw jsonb are intentionally NOT logged — frontend only needs
    // lat/lon/heading/velocity/status/route to render a historical snapshot,
    // and keeping rows small keeps storage manageable.
    const historyRows = rows
      .filter((r) => typeof r.lat === "number" && typeof r.lon === "number")
      .map((r) => ({
        train_id: r.id,
        train_num: r.train_num,
        route_name: r.route_name,
        lat: r.lat,
        lon: r.lon,
        heading: r.heading,
        velocity: r.velocity,
        status: r.status,
      }));

    if (historyRows.length > 0) {
      const { error: histError } = await supabase
        .from("train_positions")
        .insert(historyRows);
      if (histError) {
        console.error(
          log("warn", `history insert failed: ${histError.message}`),
        );
        // non-fatal — the live pipeline still works
      }
    }

    // Prune older than 1 hour so storage doesn't grow unbounded.
    const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { error: pruneError } = await supabase
      .from("train_positions")
      .delete()
      .lt("snapshot_at", cutoff);
    if (pruneError) {
      console.error(log("warn", `history prune failed: ${pruneError.message}`));
    }

    console.log(
      log(
        "info",
        `upserted ${rows.length} trains + logged ${historyRows.length} positions in ${Date.now() - startedAt}ms`,
      ),
    );
  } catch (err) {
    console.error(log("error", `poll failed: ${err.message || err}`));
    // swallow — next interval retries
  }
}

function log(level, msg) {
  return `[${new Date().toISOString()}] ${level.toUpperCase()} ${msg}`;
}

console.log(
  log(
    "info",
    `starting worker: polling ${POLL_URL} every ${POLL_INTERVAL}ms`,
  ),
);

pollOnce();
const timer = setInterval(pollOnce, POLL_INTERVAL);

function shutdown(signal) {
  console.log(log("info", `received ${signal}, shutting down`));
  clearInterval(timer);
  process.exit(0);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
