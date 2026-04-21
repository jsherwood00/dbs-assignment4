import type { AmtrakerStation } from "./types";

const AMTRAKER_STATIONS_URL = "https://api.amtraker.com/v3/stations";

let cache: AmtrakerStation[] | null = null;
let inflight: Promise<AmtrakerStation[]> | null = null;

export async function loadStations(): Promise<AmtrakerStation[]> {
  if (cache) return cache;
  if (inflight) return inflight;

  inflight = fetch(AMTRAKER_STATIONS_URL)
    .then((r) => {
      if (!r.ok) throw new Error(`stations HTTP ${r.status}`);
      return r.json();
    })
    .then((raw): AmtrakerStation[] => {
      // amtraker returns either an array or a keyed object; normalize to array.
      const values = Array.isArray(raw) ? raw : Object.values(raw ?? {});
      return values
        .filter((s: unknown): s is { code: string; name: string } => {
          return (
            !!s &&
            typeof s === "object" &&
            typeof (s as { code?: unknown }).code === "string" &&
            typeof (s as { name?: unknown }).name === "string"
          );
        })
        .map((s): AmtrakerStation => {
          const obj = s as Record<string, unknown>;
          return {
            code: String(obj.code),
            name: String(obj.name),
            city: typeof obj.city === "string" ? obj.city : undefined,
            state: typeof obj.state === "string" ? obj.state : undefined,
            lat: typeof obj.lat === "number" ? obj.lat : undefined,
            lon: typeof obj.lon === "number" ? obj.lon : undefined,
          };
        });
    })
    .then((list) => {
      cache = list;
      inflight = null;
      return list;
    })
    .catch((err) => {
      inflight = null;
      throw err;
    });

  return inflight;
}

export function searchStations(
  stations: AmtrakerStation[],
  query: string,
  limit = 8,
): AmtrakerStation[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const starts: AmtrakerStation[] = [];
  const contains: AmtrakerStation[] = [];
  for (const s of stations) {
    const code = s.code.toLowerCase();
    const name = s.name.toLowerCase();
    if (code === q || code.startsWith(q) || name.startsWith(q)) {
      starts.push(s);
    } else if (name.includes(q) || code.includes(q)) {
      contains.push(s);
    }
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}
