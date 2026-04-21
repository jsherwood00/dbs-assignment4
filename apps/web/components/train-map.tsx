"use client";

import { useEffect, useMemo } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { Train, SavedPair, TrainStation } from "@/lib/types";
import { headingToDegrees } from "@/lib/heading";
import { trainMatchesAnyPair } from "@/lib/pair";
import { useTrains } from "./trains-context";

// Continental US starting view
const INITIAL_CENTER: [number, number] = [39, -96];
const INITIAL_ZOOM = 4;

interface TrainMapProps {
  savedPairs?: SavedPair[];
}

export default function TrainMap({ savedPairs = [] }: TrainMapProps) {
  const { trains, loading, error } = useTrains();

  const visibleTrains = useMemo(() => {
    return trains.filter(
      (t) =>
        typeof t.lat === "number" &&
        typeof t.lon === "number" &&
        Number.isFinite(t.lat) &&
        Number.isFinite(t.lon),
    );
  }, [trains]);

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={INITIAL_CENTER}
        zoom={INITIAL_ZOOM}
        scrollWheelZoom
        className="h-full w-full bg-[#0b1220]"
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          subdomains={["a", "b", "c", "d"]}
          maxZoom={19}
        />
        <ZoomControlBottomRight />
        {visibleTrains.map((train) => {
          const matchedPair = trainMatchesAnyPair(train, savedPairs);
          return (
            <TrainMarker
              key={train.id}
              train={train}
              highlighted={!!matchedPair}
              pair={matchedPair}
            />
          );
        })}
      </MapContainer>

      {loading ? (
        <StatusPill>Loading live trains…</StatusPill>
      ) : error ? (
        <StatusPill tone="error">Failed to load: {error}</StatusPill>
      ) : visibleTrains.length === 0 ? (
        <StatusPill tone="warn">No active trains right now.</StatusPill>
      ) : null}
    </div>
  );
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
      ? "border-[#3a2a2a] bg-[#1a1212] text-[#f87171]"
      : tone === "warn"
        ? "border-[#3a3322] bg-[#1c1810] text-[#f5a524]"
        : "border-[#1f2b45] bg-[#131d31] text-[#e5edf7]";
  return (
    <div
      className={`pointer-events-none absolute left-1/2 top-4 z-[1000] -translate-x-1/2 rounded-full border px-3 py-1.5 text-xs backdrop-blur ${toneClasses}`}
    >
      {children}
    </div>
  );
}

interface TrainMarkerProps {
  train: Train;
  highlighted: boolean;
  pair: SavedPair | null;
}

function TrainMarker({ train, highlighted, pair }: TrainMarkerProps) {
  const icon = useMemo(
    () => buildIcon(headingToDegrees(train.heading), highlighted),
    [train.heading, highlighted],
  );

  const nextStation = findNextStation(train);
  const delayMinutes = computeDelayMinutes(train);

  return (
    <Marker
      position={[train.lat as number, train.lon as number]}
      icon={icon}
      zIndexOffset={highlighted ? 1000 : 0}
    >
      <Popup className="amtrak-popup">
        <div className="space-y-2 text-[13px] text-[#e5edf7]">
          <div className="flex items-baseline justify-between gap-3">
            <div className="font-semibold">
              {train.route_name}{" "}
              <span className="font-normal text-[#7b89a1]">
                #{train.train_num}
              </span>
            </div>
            {train.status ? (
              <span className="rounded-full border border-[#1f2b45] px-2 py-0.5 text-[11px] uppercase tracking-wider text-[#7b89a1]">
                {train.status}
              </span>
            ) : null}
          </div>
          <div className="text-[#7b89a1]">
            {train.origin_code ?? "?"} → {train.dest_code ?? "?"}
          </div>
          {pair ? (
            <div className="rounded-md border border-[#3a3322] bg-[#1c1810] px-2 py-1 text-[11px] text-[#f5a524]">
              Serves your saved pair: {pair.from_code} → {pair.to_code}
            </div>
          ) : null}
          {typeof train.velocity === "number" ? (
            <div className="text-[#7b89a1]">
              {Math.round(train.velocity)} mph
            </div>
          ) : null}
          {nextStation ? (
            <div>
              <span className="text-[#7b89a1]">Next:</span>{" "}
              {nextStation.name}{" "}
              <span className="text-[#7b89a1]">({nextStation.code})</span>
            </div>
          ) : null}
          {delayMinutes !== null ? (
            <div
              className={
                delayMinutes > 5
                  ? "text-[#f5a524]"
                  : delayMinutes < -5
                    ? "text-[#34d399]"
                    : "text-[#7b89a1]"
              }
            >
              {delayMinutes === 0
                ? "On time"
                : `${delayMinutes > 0 ? "+" : ""}${delayMinutes} min`}
            </div>
          ) : null}
        </div>
      </Popup>
    </Marker>
  );
}

function buildIcon(headingDeg: number, highlighted: boolean) {
  const cls = highlighted ? "train-marker train-marker--saved" : "train-marker";
  const size = highlighted ? 28 : 18;
  const html = `
    <div class="${cls}" style="--rot: ${headingDeg}deg;">
      <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">
        <path d="M12 2 L20 20 L12 16 L4 20 Z" fill="currentColor" />
      </svg>
    </div>
  `;
  return L.divIcon({
    className: "",
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

function findNextStation(train: Train): TrainStation | null {
  if (!train.stations || train.stations.length === 0) return null;
  const now = Date.now();
  for (const s of train.stations) {
    const ts = s.arr || s.schArr || s.dep || s.schDep;
    if (!ts) continue;
    const t = new Date(ts).getTime();
    if (Number.isFinite(t) && t >= now) return s;
  }
  return null;
}

function computeDelayMinutes(train: Train): number | null {
  if (!train.stations) return null;
  for (const s of train.stations) {
    const actual = s.arr || s.dep;
    const scheduled = s.schArr || s.schDep;
    if (!actual || !scheduled) continue;
    const a = new Date(actual).getTime();
    const sc = new Date(scheduled).getTime();
    if (Number.isFinite(a) && Number.isFinite(sc) && a > Date.now() - 48*60*60*1000) {
      return Math.round((a - sc) / 60000);
    }
  }
  return null;
}
