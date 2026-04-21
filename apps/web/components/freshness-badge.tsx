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
      <span className="hidden items-center gap-1.5 rounded-full border border-[#6b5224] bg-[#2d2312] px-2.5 py-1 text-[11px] uppercase tracking-wider text-[#f0c565] md:inline-flex">
        <Dot className="bg-[#f0c565]" />
        history · {label}
      </span>
    );
  }

  if (loading) {
    return (
      <span className="hidden items-center gap-1.5 rounded-full border border-[#4a3520] px-2.5 py-1 text-[11px] uppercase tracking-wider text-[#a08866] md:inline-flex">
        <Dot className="bg-[#a08866] animate-pulse" />
        loading
      </span>
    );
  }

  if (!lastUpdatedAt) {
    return (
      <span className="hidden items-center gap-1.5 rounded-full border border-[#6b3a2e] bg-[#2d1812] px-2.5 py-1 text-[11px] uppercase tracking-wider text-[#d9593a] md:inline-flex">
        <Dot className="bg-[#d9593a]" />
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
      classes: "border-[#3e5028] bg-[#1b2614] text-[#8ab06e]",
      dot: "bg-[#8ab06e]",
      pulse: true,
    };
  }
  if (ageMs < 5 * 60_000) {
    return {
      classes: "border-[#6b5224] bg-[#2d2312] text-[#f0c565]",
      dot: "bg-[#f0c565]",
      pulse: false,
    };
  }
  return {
    classes: "border-[#6b3a2e] bg-[#2d1812] text-[#d9593a]",
    dot: "bg-[#d9593a]",
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
