// Transforms amtraker /v3/trains payload -> rows for public.trains.
//
// amtraker returns { "<trainNum>": [ {...train}, {...train} ], ... }
// A single train number can have multiple concurrent runs, each with a
// distinct trainID (e.g. "1-20"). trainID is what we use as the PK.

export function parseTrains(payload) {
  if (!payload || typeof payload !== "object") return [];

  const now = new Date().toISOString();

  return Object.values(payload)
    .flat()
    .filter((t) => t && t.trainID)
    .map((t) => ({
      id: String(t.trainID),
      train_num: toInt(t.trainNum),
      route_name: t.routeName ?? "Unknown",
      lat: toNum(t.lat),
      lon: toNum(t.lon),
      heading: t.heading ?? null,
      velocity: toNum(t.velocity),
      status: t.trainState ?? null,
      origin_code: t.origCode ?? null,
      dest_code: t.destCode ?? null,
      stations: Array.isArray(t.stations) ? t.stations : null,
      last_updated: now,
      raw: t,
    }));
}

function toInt(v) {
  if (v === null || v === undefined || v === "") return 0;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

function toNum(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
