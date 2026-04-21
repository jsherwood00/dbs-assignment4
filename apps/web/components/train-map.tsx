"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { AmtrakerStation, Train, SavedPair } from "@/lib/types";
import { headingToDegrees } from "@/lib/heading";
import { trainMatchesAnyPair } from "@/lib/pair";
import { getStationMap, loadStations } from "@/lib/stations";
import { getSupabase } from "@/lib/supabase";
import { useTrains, type ViewMode } from "./trains-context";
import { buildPopupHTML, buildTrainFigureHTML } from "./train-figure";
import { HistorySlider } from "./history-slider";

const INITIAL_CENTER: [number, number] = [39, -96];
const INITIAL_ZOOM = 4;
const ANIMATION_DURATION_MS = 2_000;
// Minimum on-the-ground distance (meters) between consecutive positions for
// a train to count as "actually moving" and get the angry / powering visual.
// Well above civilian GPS jitter (~5–15 m) and well under even a crawling
// train's 15 s travel distance (>30 m at 5 mph, >300 m at 50 mph), so real
// motion lights up but GPS noise doesn't.
const MIN_MOVE_METERS = 60;

interface TrainMapProps {
  savedPairs?: SavedPair[];
}

export default function TrainMap({ savedPairs = [] }: TrainMapProps) {
  const { trains, loading, error, viewMode } = useTrains();
  const hasVisibleTrains = trains.some(
    (t) =>
      typeof t.lat === "number" &&
      typeof t.lon === "number" &&
      Number.isFinite(t.lat) &&
      Number.isFinite(t.lon),
  );

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={INITIAL_CENTER}
        zoom={INITIAL_ZOOM}
        scrollWheelZoom
        preferCanvas
        className="h-full w-full bg-[#05080e]"
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <ZoomControlBottomRight />
        <TrackLayer trains={trains} />
        <StationLayer trains={trains} />
        <AnimatedTrainsLayer
          trains={trains}
          savedPairs={savedPairs}
          viewMode={viewMode}
        />
        <ReplayLayer />
        <ReplayAllLayer />
      </MapContainer>

      {loading ? (
        <StatusPill>
          {viewMode.kind === "live"
            ? "Loading live trains…"
            : "Loading historical snapshot…"}
        </StatusPill>
      ) : error ? (
        <StatusPill tone="error">Failed to load: {error}</StatusPill>
      ) : !hasVisibleTrains ? (
        <StatusPill tone="warn">
          {viewMode.kind === "live"
            ? "No active trains right now."
            : "No data captured at that time yet."}
        </StatusPill>
      ) : null}

      <HistorySlider />
    </div>
  );
}

// -------------------------------------------------------------------
// TrackLayer — renders one polyline per unique route (dedup by route_name)
// so we don't stack 30 identical lines along the Northeast Corridor.
// -------------------------------------------------------------------

function TrackLayer({ trains }: { trains: Train[] }) {
  const map = useMap();
  const [stations, setStations] = useState<AmtrakerStation[] | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const drawnRef = useRef<Set<string>>(new Set());

  // Load station lat/lon lookup once
  useEffect(() => {
    let cancelled = false;
    loadStations()
      .then((list) => {
        if (!cancelled) setStations(list);
      })
      .catch(() => {
        // silent — map is fine without tracks
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Layer group for tracks (below markers)
  useEffect(() => {
    const lg = L.layerGroup().addTo(map);
    layerRef.current = lg;
    return () => {
      lg.remove();
      layerRef.current = null;
      drawnRef.current.clear();
    };
  }, [map]);

  // Add new route polylines when trains or stations change
  useEffect(() => {
    const lg = layerRef.current;
    if (!lg || !stations) return;

    const stationMap = getStationMap(stations);

    // For each route_name, pick the train with the longest stations array.
    const bestPerRoute = new Map<string, Train>();
    for (const t of trains) {
      if (!t.stations || t.stations.length < 2) continue;
      const existing = bestPerRoute.get(t.route_name);
      if (!existing || (t.stations.length > (existing.stations?.length ?? 0))) {
        bestPerRoute.set(t.route_name, t);
      }
    }

    for (const [routeName, train] of bestPerRoute) {
      // Idempotent — don't redraw if we already have this route laid down.
      if (drawnRef.current.has(routeName)) continue;

      const coords: [number, number][] = [];
      for (const s of train.stations ?? []) {
        const sm = stationMap.get(s.code);
        if (sm && typeof sm.lat === "number" && typeof sm.lon === "number") {
          coords.push([sm.lat, sm.lon]);
        }
      }
      if (coords.length < 2) continue;

      // Two-layer rail: dark base + brass top so it reads on both light
      // parchment tiles and darker terrain.
      const base = L.polyline(coords, {
        color: "#0d1520",
        opacity: 0.6,
        weight: 3.2,
        lineCap: "round",
        interactive: false,
        smoothFactor: 1.5,
      });
      const top = L.polyline(coords, {
        color: "#5ecde0",
        opacity: 0.85,
        weight: 1.4,
        dashArray: "4 6",
        lineCap: "round",
        interactive: false,
        smoothFactor: 1.5,
      });
      base.addTo(lg);
      top.addTo(lg);
      drawnRef.current.add(routeName);
    }
  }, [trains, stations]);

  return null;
}

// -------------------------------------------------------------------
// StationLayer — renders a cyan dot for each active station;
// dots pulse when a train is currently docked at that station.
// -------------------------------------------------------------------

function StationLayer({ trains }: { trains: Train[] }) {
  const map = useMap();
  const [stations, setStations] = useState<AmtrakerStation[] | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const markersRef = useRef<Map<string, L.CircleMarker>>(new Map());

  useEffect(() => {
    let cancelled = false;
    loadStations().then((list) => {
      if (!cancelled) setStations(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const lg = L.layerGroup().addTo(map);
    layerRef.current = lg;
    return () => {
      lg.remove();
      layerRef.current = null;
      markersRef.current.clear();
    };
  }, [map]);

  // Build or update the set of station markers when stations or trains change
  useEffect(() => {
    const lg = layerRef.current;
    if (!lg || !stations) return;

    // Active network = union of station codes referenced by any train's stations[]
    const active = new Set<string>();
    for (const t of trains) {
      if (t.stations) for (const s of t.stations) active.add(s.code);
    }

    // Stations where a train is currently docked (between arr and dep).
    const occupied = new Set<string>();
    const now = Date.now();
    for (const t of trains) {
      if (!t.stations) continue;
      for (const s of t.stations) {
        const arr = s.arr ? new Date(s.arr).getTime() : NaN;
        const dep = s.dep ? new Date(s.dep).getTime() : NaN;
        if (Number.isFinite(arr) && Number.isFinite(dep) && arr <= now && now <= dep) {
          occupied.add(s.code);
        }
      }
    }

    const stationMap = getStationMap(stations);

    // Force SVG renderer for stations so CSS pulse animation works
    // (the map-wide preferCanvas wouldn't honor CSS).
    const svgRenderer = L.svg();

    // Add / update markers for every active station
    for (const code of active) {
      const s = stationMap.get(code);
      if (!s || typeof s.lat !== "number" || typeof s.lon !== "number") continue;
      const isOccupied = occupied.has(code);
      const className = isOccupied
        ? "amtrak-station amtrak-station-active"
        : "amtrak-station";

      let marker = markersRef.current.get(code);
      if (!marker) {
        marker = L.circleMarker([s.lat, s.lon], {
          radius: 3,
          className,
          renderer: svgRenderer,
          interactive: true,
          bubblingMouseEvents: false,
        });
        marker.bindTooltip(`${s.name} (${s.code})`, {
          direction: "top",
          offset: [0, -4],
          className: "amtrak-station-tooltip",
        });
        marker.addTo(lg);
        markersRef.current.set(code, marker);
      } else {
        // only update className if changed
        const el = (marker as unknown as { _path?: SVGPathElement })._path;
        if (el) el.setAttribute("class", className);
      }
    }

    // Remove markers for stations that are no longer in the active set
    markersRef.current.forEach((marker, code) => {
      if (!active.has(code)) {
        lg.removeLayer(marker);
        markersRef.current.delete(code);
      }
    });
  }, [trains, stations]);

  return null;
}

// -------------------------------------------------------------------
// ReplayLayer — handles the "Replay last hour" popup button:
// fetches all snapshots for a train from the history table, pre-computes
// a smooth path + heading per-frame, hides the live marker, and plays a
// ghostly cyan version of the train SVG through the path with a growing
// trail behind it.
// -------------------------------------------------------------------

interface ReplayFrame {
  lat: number;
  lon: number;
  heading: number; // degrees, 0 = north
}

function ReplayLayer() {
  const map = useMap();
  const { trains, setReplayingTrainId } = useTrains();
  const trainsRef = useRef(trains);
  const activeRef = useRef<(() => void) | null>(null);

  // Keep a live ref so the click handler always sees the latest train list.
  useEffect(() => {
    trainsRef.current = trains;
  }, [trains]);

  useEffect(() => {
    const onClick = async (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const btn = target?.closest("[data-amtrak-replay]") as
        | HTMLButtonElement
        | null;
      if (!btn) return;
      const trainId = btn.getAttribute("data-amtrak-replay");
      if (!trainId) return;
      e.preventDefault();
      e.stopPropagation();

      // Cancel any in-flight replay first.
      activeRef.current?.();
      activeRef.current = null;

      const train = trainsRef.current.find((t) => t.id === trainId) ?? null;
      const originalText = btn.textContent ?? "";
      btn.disabled = true;
      btn.textContent = "Preparing…";

      // ---- 1. Fetch positions via JSONB RPC (REST-style .select is capped
      // at 1000, and even setof RPCs hit the same cap).
      const { data, error } = await getSupabase().rpc(
        "positions_for_train_json",
        { p_train_id: trainId },
      );

      const rows = (Array.isArray(data) ? data : []).filter(
        (r: { lat?: unknown; lon?: unknown }) =>
          typeof r.lat === "number" && typeof r.lon === "number",
      ) as Array<{ lat: number; lon: number; t: number }>;

      if (error || rows.length < 2) {
        btn.textContent = "No history yet";
        setTimeout(() => {
          btn.disabled = false;
          btn.textContent = originalText;
        }, 1800);
        return;
      }

      // ---- 2. Pre-compute frames at 60fps so the animation has no hitches.
      const DURATION_MS = 8000;
      const FPS = 60;
      const FRAMES = Math.ceil((DURATION_MS / 1000) * FPS);
      const frames: ReplayFrame[] = new Array(FRAMES);
      for (let f = 0; f < FRAMES; f++) {
        const t = f / (FRAMES - 1);
        const idx = t * (rows.length - 1);
        const i0 = Math.min(rows.length - 2, Math.floor(idx));
        const i1 = i0 + 1;
        const frac = idx - i0;
        const lat = rows[i0].lat + (rows[i1].lat - rows[i0].lat) * frac;
        const lon = rows[i0].lon + (rows[i1].lon - rows[i0].lon) * frac;
        const heading = bearingDeg(
          rows[i0].lat,
          rows[i0].lon,
          rows[i1].lat,
          rows[i1].lon,
        );
        frames[f] = { lat, lon, heading };
      }

      // Trail always covers the already-traversed segment of the raw points
      // (so the "route" line reads clearly, not a series of interpolated dots).
      const rawCoords = rows.map((r) => [r.lat, r.lon] as [number, number]);

      btn.textContent = "▶ Replaying…";
      setReplayingTrainId(trainId);

      const lg = L.layerGroup().addTo(map);

      // Trail polyline (grows as we go). Colors set directly so canvas honors them.
      const trail = L.polyline([], {
        color: "#8ee7f4",
        opacity: 0.9,
        weight: 2.5,
        lineCap: "round",
        className: "amtrak-replay-trail",
        interactive: false,
        smoothFactor: 1.2,
      }).addTo(lg);

      // Ghost marker = the train SVG in ghost mode.
      const saved = false; // ghosts don't carry the saved-pair halo
      const buildGhostIcon = (headingDeg: number) =>
        L.divIcon({
          className: "",
          html: buildTrainFigureHTML(headingDeg, saved, false, /* ghost */ true),
          iconSize: [36, 24],
          iconAnchor: [18, 12],
        });

      const ghost = L.marker([frames[0].lat, frames[0].lon], {
        icon: buildGhostIcon(frames[0].heading),
        interactive: false,
        zIndexOffset: 2000,
      }).addTo(lg);

      // ---- 3. Animate: advance a frame index by wall-clock time.
      const start = performance.now();
      let raf: number | null = null;
      let cancelled = false;
      let lastHeading = frames[0].heading;

      const tick = () => {
        if (cancelled) return;
        const elapsed = performance.now() - start;
        const t = Math.min(1, elapsed / DURATION_MS);
        const fIdx = Math.min(FRAMES - 1, Math.floor(t * (FRAMES - 1)));
        const f = frames[fIdx];
        ghost.setLatLng([f.lat, f.lon]);

        // Only rebuild the icon when heading meaningfully changes (avoid DOM churn).
        if (Math.abs(f.heading - lastHeading) > 5) {
          ghost.setIcon(buildGhostIcon(f.heading));
          lastHeading = f.heading;
        }

        // Grow trail: raw points up to the current index + current position.
        const rawIdx = Math.floor(t * (rawCoords.length - 1));
        const growing = rawCoords.slice(0, rawIdx + 1).concat([[f.lat, f.lon]]);
        trail.setLatLngs(growing);

        if (t < 1) {
          raf = requestAnimationFrame(tick);
        } else {
          // Hold the finished frame briefly, then fade out.
          setTimeout(() => {
            if (cancelled) return;
            cleanup();
          }, 900);
        }
      };

      const cleanup = () => {
        cancelled = true;
        if (raf !== null) cancelAnimationFrame(raf);
        lg.remove();
        setReplayingTrainId(null);
        btn.disabled = false;
        btn.textContent = originalText;
        activeRef.current = null;
        void train; // reserved for future "zoom to train origin" behavior
      };

      activeRef.current = cleanup;
      raf = requestAnimationFrame(tick);
    };

    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("click", onClick);
      activeRef.current?.();
      activeRef.current = null;
    };
  }, [map, setReplayingTrainId]);

  return null;
}

// Compass bearing (0–360, 0 = north, 90 = east) from (lat1, lon1) -> (lat2, lon2).
function bearingDeg(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = Math.PI / 180;
  const φ1 = lat1 * toRad;
  const φ2 = lat2 * toRad;
  const Δλ = (lon2 - lon1) * toRad;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

// -------------------------------------------------------------------
// ReplayAllLayer — listens for window 'amtrak:replay-all', fetches all
// last-hour positions in ONE shot, pre-computes 30 frames of positions
// (one per 2-minute bucket) per train, then plays the whole fleet back
// in 10 seconds as ghostly trains with growing trails.
// -------------------------------------------------------------------

function reportStatus(kind: "idle" | "preparing" | "playing" | "done", message: string, progress?: number) {
  window.dispatchEvent(
    new CustomEvent("amtrak:replay-all:status", {
      detail: { kind, message, progress },
    }),
  );
}

function ReplayAllLayer() {
  const map = useMap();
  const { trains, setReplayAllActive } = useTrains();
  const trainsRef = useRef(trains);

  useEffect(() => {
    trainsRef.current = trains;
  }, [trains]);

  useEffect(() => {
    let cancelCurrent: (() => void) | null = null;

    const handler = async () => {
      cancelCurrent?.();
      cancelCurrent = null;

      reportStatus("preparing", "Fetching 1 hour of history…");

      const { data, error } = await getSupabase().rpc("positions_last_hour_json");

      if (error || !data || typeof data !== "object") {
        reportStatus("done", error ? `Failed: ${error.message}` : "No history yet");
        setTimeout(() => reportStatus("idle", ""), 2200);
        return;
      }

      const byTrain = data as Record<
        string,
        Array<{ lat: number; lon: number; t: number }>
      >;
      const trainIds = Object.keys(byTrain);

      if (trainIds.length === 0) {
        reportStatus("done", "No history yet");
        setTimeout(() => reportStatus("idle", ""), 2200);
        return;
      }

      reportStatus("preparing", "Preparing frames…");

      // ---- No bucketing, no carry-forward. For each train we keep the raw
      // (lat, lon, t) samples sorted by t. The animation interpolates between
      // whatever two samples bracket the current virtual time, which means
      // data gaps are played as continuous motion through the gap (not a
      // pause at the last known point). A train that was actually parked
      // reports the same (lat, lon) across multiple samples, and that still
      // interpolates to itself — parked trains stay parked.
      const endSec = Math.floor(Date.now() / 1000);
      const startSec = endSec - 60 * 60;

      interface TrainPoint {
        lat: number;
        lon: number;
        t: number;
      }
      const perTrain = new Map<string, TrainPoint[]>();
      for (const trainId of trainIds) {
        const raw = byTrain[trainId];
        if (!Array.isArray(raw) || raw.length === 0) continue;
        const points: TrainPoint[] = [];
        for (const p of raw) {
          if (typeof p.lat !== "number" || typeof p.lon !== "number") continue;
          if (typeof p.t !== "number") continue;
          points.push({ lat: p.lat, lon: p.lon, t: p.t });
        }
        if (points.length === 0) continue;
        // RPC returns ordered, but defend against that changing.
        points.sort((a, b) => a.t - b.t);
        perTrain.set(trainId, points);
      }

      // Resolve per-train heading (use the current live train's heading as
      // a fallback; for the replay we recompute it per-step from motion).
      const trainsNow = trainsRef.current;
      const headingById = new Map<string, string | null>();
      for (const t of trainsNow) {
        headingById.set(t.id, t.heading ?? null);
      }
      const isSavedById = new Map<string, boolean>();
      // We don't really need saved status for the replay; treat all as plain.

      reportStatus("preparing", "Building ghost fleet…");

      // ---- Create overlay fleet
      const lg = L.layerGroup().addTo(map);
      const ghosts = new Map<string, L.Marker>();
      const trails = new Map<string, L.Polyline>();
      const trailCoords = new Map<string, [number, number][]>();

      // Replay-All uses the plain silver locomotive — no ember, no steam,
      // no ghost glow. The animation itself is the story; extra styling
      // just makes 190 trains moving at once look like visual noise.
      const buildIcon = (headingDeg: number) =>
        L.divIcon({
          className: "",
          html: buildTrainFigureHTML(headingDeg, false, false, false),
          iconSize: [28, 18],
          iconAnchor: [14, 9],
        });

      // Seed at the first known position per train. No trails — just the
      // locomotives. (trails/trailCoords are still declared above but
      // intentionally unused in this no-effects pass.)
      perTrain.forEach((points, id) => {
        const first = points[0];
        const seedHeadingStr = headingById.get(id);
        const seedHeading = seedHeadingStr ? headingToDegrees(seedHeadingStr) : 0;
        const g = L.marker([first.lat, first.lon], {
          icon: buildIcon(seedHeading),
          interactive: false,
          zIndexOffset: 1500,
        }).addTo(lg);
        ghosts.set(id, g);
        isSavedById.set(id, false);
      });
      // Silence unused warnings for trails — we don't render them in this mode.
      void trails;
      void trailCoords;

      // ---- Hide live markers while the replay owns the stage.
      setReplayAllActive(true);

      // ---- Smooth RAF animation over 10 s using actual wall-clock
      // timestamps, not buckets.
      //
      // For each train we keep a monotonically advancing cursor i such
      // that points[i].t <= virtualSec < points[i+1].t. On each frame we
      // advance the cursor forward (O(1) amortized) and linearly blend
      // between points[i] and points[i+1] by
      //     frac = (virtualSec - points[i].t) / (points[i+1].t - points[i].t)
      //
      // Consequences:
      //   - Trains with a gap in their snapshots (worker paused, amtraker
      //     hiccup, etc.) glide smoothly across the gap instead of
      //     pausing at the last known point.
      //   - A train that actually reported the same (lat, lon) twice
      //     still interpolates to itself — so parked trains stay parked.
      //   - A train outside its data range (its run started mid-hour, or
      //     it completed mid-hour) stays hidden at opacity 0 until its
      //     data window begins / after it ends.
      const TOTAL_MS = 10_000;
      let cancelled = false;
      const cursorById = new Map<string, number>();
      const lastHeadingById = new Map<string, number>();
      let lastStatusReport = -1;

      reportStatus("playing", "Replaying · 0/60 min", 0);

      let rafId = 0;
      const animStart = performance.now();
      const tick = (nowTs: number) => {
        if (cancelled) return;
        const elapsed = nowTs - animStart;
        const progress = Math.min(1, elapsed / TOTAL_MS);
        const virtualSec = startSec + progress * (endSec - startSec);

        perTrain.forEach((points, id) => {
          const g = ghosts.get(id);
          if (!g) return;
          const first = points[0];
          const last = points[points.length - 1];

          // Always render at full opacity. Three cases, all visually
          // identical (silver locomotive at some position):
          //   1. Before first sample: park at the first known position.
          //   2. After last sample:  park at the last known position.
          //   3. Inside the data window: cursor-advance and interpolate
          //      between the two bracketing samples.
          let lat: number;
          let lon: number;
          let segmentA = first;
          let segmentB = first;

          if (virtualSec <= first.t) {
            lat = first.lat;
            lon = first.lon;
          } else if (virtualSec >= last.t) {
            lat = last.lat;
            lon = last.lon;
          } else {
            // Advance cursor monotonically.
            let i = cursorById.get(id) ?? 0;
            while (
              i < points.length - 1 &&
              points[i + 1].t <= virtualSec
            ) {
              i++;
            }
            cursorById.set(id, i);

            segmentA = points[i];
            segmentB = points[Math.min(i + 1, points.length - 1)];
            const span = segmentB.t - segmentA.t;
            const frac = span > 0
              ? Math.max(0, Math.min(1, (virtualSec - segmentA.t) / span))
              : 0;
            lat = segmentA.lat + (segmentB.lat - segmentA.lat) * frac;
            lon = segmentA.lon + (segmentB.lon - segmentA.lon) * frac;
          }

          g.setLatLng([lat, lon]);

          // Heading update — only when we have a real segment with
          // enough distance to establish a direction.
          if (
            segmentA !== segmentB &&
            approxMeters(
              segmentA.lat,
              segmentA.lon,
              segmentB.lat,
              segmentB.lon,
            ) > 40
          ) {
            const heading = bearingDeg(
              segmentA.lat,
              segmentA.lon,
              segmentB.lat,
              segmentB.lon,
            );
            const lastH = lastHeadingById.get(id) ?? -999;
            if (Math.abs(heading - lastH) > 10) {
              g.setIcon(buildIcon(heading));
              lastHeadingById.set(id, heading);
            }
          }
        });

        // Throttle status updates to ~3/s so we don't thrash React.
        if (elapsed - lastStatusReport > 300) {
          const minsIn = Math.min(60, Math.round(progress * 60));
          reportStatus(
            "playing",
            `Replaying · ${minsIn}/60 min`,
            progress,
          );
          lastStatusReport = elapsed;
        }

        if (progress >= 1) {
          reportStatus("done", "Replay complete", 1);
          setTimeout(() => {
            if (cancelled) return;
            cleanup();
            reportStatus("idle", "");
          }, 1200);
          return;
        }

        rafId = requestAnimationFrame(tick);
      };

      const cleanup = () => {
        cancelled = true;
        cancelAnimationFrame(rafId);
        lg.remove();
        setReplayAllActive(false);
        cancelCurrent = null;
      };

      cancelCurrent = cleanup;
      rafId = requestAnimationFrame(tick);
    };

    window.addEventListener("amtrak:replay-all", handler);
    return () => {
      window.removeEventListener("amtrak:replay-all", handler);
      cancelCurrent?.();
    };
  }, [map, setReplayAllActive]);

  return null;
}

function ZoomControlBottomRight() {
  const map = useMap();
  useEffect(() => {
    const ctl = L.control.zoom({ position: "bottomright" });
    ctl.addTo(map);
    return () => {
      ctl.remove();
    };
  }, [map]);
  return null;
}

function StatusPill({
  children,
  tone = "info",
}: {
  children: React.ReactNode;
  tone?: "info" | "warn" | "error";
}) {
  const toneClasses =
    tone === "error"
      ? "border-[#6b2e2e] bg-[#260c0c] text-[#ef4c4c]"
      : tone === "warn"
        ? "border-[#6b5224] bg-[#221a0a] text-[#f0c565]"
        : "border-[#1c2a3e] bg-[#0d1520] text-[#d8e4f0]";
  return (
    <div
      className={`pointer-events-none absolute left-1/2 top-4 z-[1000] -translate-x-1/2 rounded-full border px-3 py-1.5 text-xs backdrop-blur ${toneClasses}`}
    >
      {children}
    </div>
  );
}

// -------------------------------------------------------------------
// AnimatedTrainsLayer — imperative marker management + RAF animation
// -------------------------------------------------------------------

interface MarkerState {
  marker: L.Marker;
  displayLat: number;
  displayLon: number;
  targetLat: number;
  targetLon: number;
  anim: { startLat: number; startLon: number; start: number } | null;
  lastIconKey: string; // tracks (heading, saved, moving) so we only rebuild on change
}

interface AnimatedTrainsLayerProps {
  trains: Train[];
  savedPairs: SavedPair[];
  viewMode: ViewMode;
}

function AnimatedTrainsLayer({
  trains,
  savedPairs,
  viewMode,
}: AnimatedTrainsLayerProps) {
  const map = useMap();
  const { replayingTrainId, replayAllActive } = useTrains();
  const layerRef = useRef<L.LayerGroup | null>(null);
  const statesRef = useRef<Map<string, MarkerState>>(new Map());
  const rafRef = useRef<number | null>(null);
  const isHistory = viewMode.kind === "history";

  // Hide markers that are currently being replayed (single train OR replay-all).
  useEffect(() => {
    statesRef.current.forEach((state, id) => {
      const hidden = replayAllActive || id === replayingTrainId;
      const el = state.marker.getElement() as HTMLElement | null;
      if (el) {
        el.style.opacity = hidden ? "0" : "1";
        el.style.pointerEvents = hidden ? "none" : "";
      }
    });
  }, [replayingTrainId, replayAllActive]);

  // Create layer group once
  useEffect(() => {
    const lg = L.layerGroup().addTo(map);
    layerRef.current = lg;
    return () => {
      lg.remove();
      layerRef.current = null;
      statesRef.current.clear();
    };
  }, [map]);

  // When view mode switches, clear all markers so the next render starts fresh
  // (avoids animating from live position to a 45-min-ago position).
  const viewKey =
    viewMode.kind === "live" ? "live" : `history:${viewMode.at}`;
  useEffect(() => {
    const lg = layerRef.current;
    if (!lg) return;
    statesRef.current.forEach((state) => {
      lg.removeLayer(state.marker);
    });
    statesRef.current.clear();
  }, [viewKey]);

  // Sync markers with trains on every update
  useEffect(() => {
    const lg = layerRef.current;
    if (!lg) return;

    const incomingIds = new Set<string>();

    for (const train of trains) {
      if (
        typeof train.lat !== "number" ||
        typeof train.lon !== "number" ||
        !Number.isFinite(train.lat) ||
        !Number.isFinite(train.lon)
      ) {
        continue;
      }
      incomingIds.add(train.id);

      const matchedPair = trainMatchesAnyPair(train, savedPairs);
      const isSaved = matchedPair !== null;
      const headingDeg = headingToDegrees(train.heading);

      let state = statesRef.current.get(train.id);

      if (!state) {
        // First time we see this train — create marker at its current position, no animation
        const iconKey = iconCacheKey(headingDeg, isSaved, false);
        const marker = L.marker([train.lat, train.lon], {
          icon: L.divIcon({
            className: "",
            html: buildTrainFigureHTML(headingDeg, isSaved, false),
            iconSize: isSaved ? [52, 36] : [36, 24],
            iconAnchor: isSaved ? [26, 18] : [18, 12],
            popupAnchor: [0, -12],
          }),
          zIndexOffset: isSaved ? 1000 : 0,
          riseOnHover: true,
        });
        marker.bindPopup(buildPopupHTML(train, matchedPair), {
          closeButton: true,
          offset: [0, -4],
        });
        lg.addLayer(marker);

        state = {
          marker,
          displayLat: train.lat,
          displayLon: train.lon,
          targetLat: train.lat,
          targetLon: train.lon,
          anim: null,
          lastIconKey: iconKey,
        };
        statesRef.current.set(train.id, state);
      } else {
        // Existing marker — refresh popup always (data may have changed)
        state.marker.setPopupContent(buildPopupHTML(train, matchedPair));

        if (isHistory) {
          // Static snapshot — snap to new position, no animation, never "angry".
          state.displayLat = train.lat;
          state.displayLon = train.lon;
          state.targetLat = train.lat;
          state.targetLon = train.lon;
          state.anim = null;
          state.marker.setLatLng([train.lat, train.lon]);
        } else {
          // Live: if the train actually moved on-the-ground, start / retarget an
          // animation FROM the currently-displayed position.
          const movedMeters = approxMeters(
            state.targetLat,
            state.targetLon,
            train.lat,
            train.lon,
          );
          if (movedMeters > MIN_MOVE_METERS) {
            state.targetLat = train.lat;
            state.targetLon = train.lon;
            state.anim = {
              startLat: state.displayLat,
              startLon: state.displayLon,
              start: performance.now(),
            };
          }
        }

        // Rebuild icon only when heading / saved / moving state changes
        const moving = !isHistory && state.anim !== null;
        const nextKey = iconCacheKey(headingDeg, isSaved, moving);
        if (nextKey !== state.lastIconKey) {
          state.marker.setIcon(
            L.divIcon({
              className: "",
              html: buildTrainFigureHTML(headingDeg, isSaved, moving),
              iconSize: isSaved ? [52, 36] : [36, 24],
              iconAnchor: isSaved ? [26, 18] : [18, 12],
              popupAnchor: [0, -12],
            }),
          );
          state.marker.setZIndexOffset(isSaved ? 1000 : 0);
          state.lastIconKey = nextKey;
        }
      }
    }

    // Remove markers for trains that disappeared from the feed
    statesRef.current.forEach((state, id) => {
      if (!incomingIds.has(id)) {
        lg.removeLayer(state.marker);
        statesRef.current.delete(id);
      }
    });
  }, [trains, savedPairs, map]);

  // Single RAF loop drives ALL in-flight animations
  useEffect(() => {
    const tick = () => {
      const now = performance.now();
      statesRef.current.forEach((state, id) => {
        if (!state.anim) return;
        const progress = Math.min(
          1,
          (now - state.anim.start) / ANIMATION_DURATION_MS,
        );
        const eased = easeInOutCubic(progress);
        const lat =
          state.anim.startLat + (state.targetLat - state.anim.startLat) * eased;
        const lon =
          state.anim.startLon + (state.targetLon - state.anim.startLon) * eased;
        state.displayLat = lat;
        state.displayLon = lon;
        state.marker.setLatLng([lat, lon]);

        if (progress >= 1) {
          state.anim = null;
          // Swap icon back to non-moving (steam stops)
          const el = state.marker.getElement();
          el?.querySelector(".train-figure")?.classList.remove(
            "train-figure--moving",
          );
          // Update the cache key so next icon rebuild doesn't add the moving class
          const existingKey = state.lastIconKey;
          state.lastIconKey = existingKey.replace("|moving", "|still");
          void id;
        }
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return null;
}

function iconCacheKey(
  headingDeg: number,
  saved: boolean,
  moving: boolean,
): string {
  return `${Math.round(headingDeg)}|${saved ? "saved" : "plain"}|${moving ? "moving" : "still"}`;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Flat-earth approximation of distance in meters between two lat/lon points.
// Accurate enough below ~10 km; we only care about movement vs. GPS noise.
function approxMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const latMetersPerDeg = 111_000;
  const lonMetersPerDeg = 111_000 * Math.cos((lat1 * Math.PI) / 180);
  const dLat = (lat2 - lat1) * latMetersPerDeg;
  const dLon = (lon2 - lon1) * lonMetersPerDeg;
  return Math.sqrt(dLat * dLat + dLon * dLon);
}
