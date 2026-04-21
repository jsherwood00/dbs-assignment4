"use client";

import { useEffect, useState } from "react";
import { useTrains } from "./trains-context";

export function FreshnessBadge() {
  const { lastUpdatedAt, loading } = useTrains();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (loading) {
    return (
      <span className="hidden items-center gap-1.5 rounded-full border border-[#1f2b45] px-2.5 py-1 text-[11px] uppercase tracking-wider text-[#7b89a1] md:inline-flex">
        <Dot className="bg-[#7b89a1] animate-pulse" />
        loading
      </span>
    );
  }

  if (!lastUpdatedAt) {
    return (
      <span className="hidden items-center gap-1.5 rounded-full border border-[#3a2a2a] bg-[#1a1212] px-2.5 py-1 text-[11px] uppercase tracking-wider text-[#f87171] md:inline-flex">
        <Dot className="bg-[#f87171]" />
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

function classify(ageMs: number) {
  if (ageMs < 90_000) {
    return {
      classes: "border-[#1f3a2d] bg-[#0f1b16] text-[#34d399]",
      dot: "bg-[#34d399]",
      pulse: true,
    };
  }
  if (ageMs < 5 * 60_000) {
    return {
      classes: "border-[#3a3322] bg-[#1c1810] text-[#f5a524]",
      dot: "bg-[#f5a524]",
      pulse: false,
    };
  }
  return {
    classes: "border-[#3a2a2a] bg-[#1a1212] text-[#f87171]",
    dot: "bg-[#f87171]",
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
