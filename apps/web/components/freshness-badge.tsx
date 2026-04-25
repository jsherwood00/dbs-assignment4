"use client";

import { useEffect, useState } from "react";
import { useTrains } from "./trains-context";

export function FreshnessBadge() {
  const { lastUpdatedAt, loading, viewMode } = useTrains();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (viewMode.kind === "history") {
    const minsBack = Math.max(0, Math.round((now - viewMode.at) / 60_000));
    const label =
      minsBack < 1 ? "just now" : minsBack === 1 ? "1 min ago" : `${minsBack} min ago`;
    return (
      <span className="hidden items-center gap-1.5 rounded-full border border-[#6b5224] bg-[#221a0a] px-2.5 py-1 text-[11px] uppercase tracking-wider text-[#f0c565] md:inline-flex">
        <Dot className="bg-[#f0c565]" />
        history · {label}
      </span>
    );
  }

  if (loading) {
    return (
      <span className="hidden items-center gap-1.5 rounded-full border border-[#1c2a3e] px-2.5 py-1 text-[11px] uppercase tracking-wider text-[#5a6d82] md:inline-flex">
        <Dot className="bg-[#5a6d82] animate-pulse" />
        loading
      </span>
    );
  }

  if (!lastUpdatedAt) {
    return (
      <span className="hidden items-center gap-1.5 rounded-full border border-[#6b2e2e] bg-[#260c0c] px-2.5 py-1 text-[11px] uppercase tracking-wider text-[#ef4c4c] md:inline-flex">
        <Dot className="bg-[#ef4c4c]" />
        no data
      </span>
    );
  }

  const ageMs = now - lastUpdatedAt;
  const status = classify(ageMs);

  return (
    <span
      title={`Last update: ${new Date(lastUpdatedAt).toLocaleTimeString()}`}
      className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-wider md:inline-flex ${status.classes}`}
    >
      <Dot className={`${status.dot} ${status.pulse ? "animate-pulse" : ""}`} />
      live · {formatAge(ageMs)}
    </span>
  );
}

function Dot({ className }: { className?: string }) {
  return (
    <span aria-hidden className={`inline-block h-1.5 w-1.5 rounded-full ${className ?? ""}`} />
  );
}

// Thresholds tuned for the worker's 5-minute poll cadence:
//   green  while we're inside one normal poll cycle (<6 min)
//   amber  if a poll's been delayed (<12 min)
//   red    if we've missed multiple polls (>12 min) — something's broken
function classify(ageMs: number) {
  if (ageMs < 6 * 60_000) {
    return {
      classes: "border-[#225a3f] bg-[#0d2418] text-[#64e2a4]",
      dot: "bg-[#64e2a4]",
      pulse: true,
    };
  }
  if (ageMs < 12 * 60_000) {
    return {
      classes: "border-[#6b5224] bg-[#221a0a] text-[#f0c565]",
      dot: "bg-[#f0c565]",
      pulse: false,
    };
  }
  return {
    classes: "border-[#6b2e2e] bg-[#260c0c] text-[#ef4c4c]",
    dot: "bg-[#ef4c4c]",
    pulse: false,
  };
}

function formatAge(ms: number): string {
  if (ms < 0) return "just now";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}
