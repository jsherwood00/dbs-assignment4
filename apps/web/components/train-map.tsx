"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { AmtrakerStation, Train, SavedPair } from "@/lib/types";
import { headingToDegrees } from "@/lib/heading";
import { trainMatchesAnyPair } from "@/lib/pair";
import { getStationMap, loadStations } from "@/lib/stations";
import { useTrains } from "./trains-context";
import { buildPopupHTML, buildTrainFigureHTML } from "./train-figure";

const INITIAL_CENTER: [number, number] = [39, -96];
const INITIAL_ZOOM = 4;
const ANIMATION_DURATION_MS = 10_000;
// Minimum lat/lon delta (degrees) to consider a train "moved" vs. GPS jitter.
// 0.0001° is roughly 11 meters — well under a typical Amtrak 30s travel distance
// (>600m even at slow speeds) but above civilian GPS jitter (~5m).
const MIN_LATLON_DELTA = 1e-4;

interface TrainMapProps {
  savedPairs?: SavedPair[];
}

export default function TrainMap({ savedPairs = [] }: TrainMapProps) {
  const { trains, loading, error } = useTrains();
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
        className="h-full w-full bg-[#1a140d]"
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <ZoomControlBottomRight />
        <TrackLayer trains={trains} />
        <AnimatedTrainsLayer trains={trains} savedPairs={savedPairs} />
      </MapContainer>

      {loading ? (
        <StatusPill>Loading live trains…</StatusPill>
      ) : error ? (
        <StatusPill tone="error">Failed to load: {error}</StatusPill>
      ) : !hasVisibleTrains ? (
        <StatusPill tone="warn">No active trains right now.</StatusPill>
      ) : null}
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
        color: "#2b1f15",
        opacity: 0.6,
        weight: 3.2,
        lineCap: "round",
        interactive: false,
        smoothFactor: 1.5,
      });
      const top = L.polyline(coords, {
        color: "#c5a572",
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
      ? "border-[#6b3a2e] bg-[#2d1812] text-[#d9593a]"
      : tone === "warn"
        ? "border-[#6b5224] bg-[#2d2312] text-[#f0c565]"
        : "border-[#4a3520] bg-[#2b1f15] text-[#f0e4cb]";
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
}

function AnimatedTrainsLayer({
  trains,
  savedPairs,
}: AnimatedTrainsLayerProps) {
  const map = useMap();
  const layerRef = useRef<L.LayerGroup | null>(null);
  const statesRef = useRef<Map<string, MarkerState>>(new Map());
  const rafRef = useRef<number | null>(null);

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

        // If target moved, start / retarget an animation FROM the currently-displayed position
        const latDelta = Math.abs(train.lat - state.targetLat);
        const lonDelta = Math.abs(train.lon - state.targetLon);
        if (latDelta > MIN_LATLON_DELTA || lonDelta > MIN_LATLON_DELTA) {
          state.targetLat = train.lat;
          state.targetLon = train.lon;
          state.anim = {
            startLat: state.displayLat,
            startLon: state.displayLon,
            start: performance.now(),
          };
        }

        // Rebuild icon only when heading / saved / moving state changes
        const moving = state.anim !== null;
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
