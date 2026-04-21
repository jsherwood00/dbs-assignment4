"use client";

import { useEffect, useMemo, useState } from "react";
import { useTrains } from "./trains-context";

const STEP_MS = 15_000; // 15 seconds per step — matches worker poll cadence
const WINDOW_MS = 60 * 60 * 1000; // 1 hour of history
const MAX_STEP = WINDOW_MS / STEP_MS; // 240 steps

export function HistorySlider() {
  const { viewMode, setViewMode } = useTrains();
  const [now, setNow] = useState(() => Date.now());

  // Refresh the derived "X min ago" label and slider position every second.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const sliderValue = useMemo(() => {
    if (viewMode.kind === "live") return MAX_STEP;
    const stepsBack = Math.round((now - viewMode.at) / STEP_MS);
    return Math.max(0, Math.min(MAX_STEP, MAX_STEP - stepsBack));
  }, [viewMode, now]);

  const onChange = (v: number) => {
    if (v >= MAX_STEP) {
      setViewMode({ kind: "live" });
    } else {
      const stepsBack = MAX_STEP - v;
      setViewMode({ kind: "history", at: Date.now() - stepsBack * STEP_MS });
    }
  };

  const label =
    viewMode.kind === "live" ? "LIVE" : formatRelative(now - viewMode.at);

  const absoluteTime =
    viewMode.kind === "history"
      ? new Date(viewMode.at).toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit",
        })
      : null;

  return (
    <div
      className="pointer-events-auto absolute bottom-5 left-1/2 z-[600] -translate-x-1/2"
      style={{ minWidth: 520 }}
    >
      <div className="flex items-center gap-3 rounded-full border border-[#4a3520] bg-[#2b1f15]/95 px-4 py-2.5 shadow-xl backdrop-blur">
        <button
          type="button"
          onClick={() => setViewMode({ kind: "live" })}
          title="Return to live view"
          className={`flex h-7 items-center gap-1.5 rounded-full border px-3 text-[10px] font-bold uppercase tracking-[0.15em] transition-colors ${
            viewMode.kind === "live"
              ? "border-[#3e5028] bg-[#1b2614] text-[#8ab06e]"
              : "border-[#4a3520] bg-[#1a140d] text-[#a08866] hover:border-[#c5a572] hover:text-[#f0e4cb]"
          }`}
        >
          <span
            aria-hidden
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              viewMode.kind === "live" ? "bg-[#8ab06e] animate-pulse" : "bg-[#a08866]"
            }`}
          />
          Live
        </button>

        <div className="flex flex-1 items-center gap-3">
          <span className="font-display text-[10px] font-bold uppercase tracking-[0.18em] text-[#a08866]">
            −1h
          </span>
          <input
            type="range"
            min={0}
            max={MAX_STEP}
            step={1}
            value={sliderValue}
            onChange={(e) => onChange(Number(e.target.value))}
            className="history-slider flex-1"
            aria-label="Time travel slider"
          />
          <span className="font-display text-[10px] font-bold uppercase tracking-[0.18em] text-[#a08866]">
            now
          </span>
        </div>

        <div className="flex min-w-[82px] flex-col items-end leading-none">
          <span
            className={`font-display text-[11px] font-bold uppercase tracking-[0.18em] ${
              viewMode.kind === "live" ? "text-[#8ab06e]" : "text-[#f0c565]"
            }`}
          >
            {label}
          </span>
          {absoluteTime ? (
            <span className="mt-0.5 text-[10px] text-[#a08866]">
              {absoluteTime}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function formatRelative(ms: number): string {
  if (ms < 60_000) {
    const s = Math.max(0, Math.round(ms / 1000));
    return `−${s}s`;
  }
  const m = Math.round(ms / 60_000);
  return `−${m}m`;
}
