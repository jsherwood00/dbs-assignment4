"use client";

import { useEffect, useMemo, useState } from "react";
import { useTrains } from "./trains-context";

const STEP_MS = 15_000; // 15 seconds per step — matches worker poll cadence
const WINDOW_MS = 60 * 60 * 1000; // 1 hour of history
const MAX_STEP = WINDOW_MS / STEP_MS; // 240 steps

type ReplayStatus =
  | { kind: "idle" }
  | { kind: "preparing"; message: string }
  | { kind: "playing"; message: string; progress: number }
  | { kind: "done"; message: string };

export function HistorySlider() {
  const { viewMode, setViewMode, replayAllActive } = useTrains();
  const [now, setNow] = useState(() => Date.now());
  const [replayStatus, setReplayStatus] = useState<ReplayStatus>({
    kind: "idle",
  });

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Listen for replay-all status updates.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        kind: "idle" | "preparing" | "playing" | "done";
        message: string;
        progress?: number;
      };
      if (detail.kind === "idle") setReplayStatus({ kind: "idle" });
      else if (detail.kind === "preparing")
        setReplayStatus({ kind: "preparing", message: detail.message });
      else if (detail.kind === "playing")
        setReplayStatus({
          kind: "playing",
          message: detail.message,
          progress: detail.progress ?? 0,
        });
      else if (detail.kind === "done")
        setReplayStatus({ kind: "done", message: detail.message });
    };
    window.addEventListener("amtrak:replay-all:status", handler);
    return () =>
      window.removeEventListener("amtrak:replay-all:status", handler);
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

  const replayDisabled =
    replayAllActive ||
    replayStatus.kind === "preparing" ||
    replayStatus.kind === "playing";

  const onReplayAll = () => {
    if (replayDisabled) return;
    window.dispatchEvent(new CustomEvent("amtrak:replay-all"));
  };

  return (
    <div
      className="pointer-events-auto absolute bottom-5 left-1/2 z-[600] -translate-x-1/2"
      style={{ minWidth: 580 }}
    >
      <div className="flex flex-col gap-2">
        {/* Status banner — only when not idle */}
        {replayStatus.kind !== "idle" ? (
          <div className="mx-auto flex items-center gap-2 rounded-full border border-[#1c2a3e] bg-[#0d1520]/95 px-3 py-1.5 text-[10px] uppercase tracking-[0.15em] text-[#5ecde0] shadow-lg backdrop-blur">
            <span
              aria-hidden
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                replayStatus.kind === "playing"
                  ? "bg-[#5ecde0] animate-pulse"
                  : "bg-[#5ecde0]"
              }`}
            />
            <span className="whitespace-nowrap">{replayStatus.message}</span>
            {replayStatus.kind === "playing" ? (
              <div className="ml-2 h-1 w-32 overflow-hidden rounded-full bg-[#1c2a3e]">
                <div
                  className="h-full bg-[#5ecde0]"
                  style={{ width: `${Math.round(replayStatus.progress * 100)}%` }}
                />
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Main dock */}
        <div className="flex items-center gap-3 rounded-full border border-[#1c2a3e] bg-[#0d1520]/95 px-4 py-2.5 shadow-xl backdrop-blur">
          <button
            type="button"
            onClick={() => setViewMode({ kind: "live" })}
            title="Return to live view"
            className={`flex h-7 items-center gap-1.5 rounded-full border px-3 text-[10px] font-bold uppercase tracking-[0.15em] transition-colors ${
              viewMode.kind === "live"
                ? "border-[#225a3f] bg-[#0d2418] text-[#64e2a4]"
                : "border-[#1c2a3e] bg-[#05080e] text-[#5a6d82] hover:border-[#5ecde0] hover:text-[#d8e4f0]"
            }`}
          >
            <span
              aria-hidden
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                viewMode.kind === "live"
                  ? "bg-[#64e2a4] animate-pulse"
                  : "bg-[#5a6d82]"
              }`}
            />
            Live
          </button>

          <div className="flex flex-1 items-center gap-3">
            <span className="font-display text-[10px] font-bold uppercase tracking-[0.18em] text-[#5a6d82]">
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
            <span className="font-display text-[10px] font-bold uppercase tracking-[0.18em] text-[#5a6d82]">
              now
            </span>
          </div>

          <button
            type="button"
            onClick={onReplayAll}
            disabled={replayDisabled}
            title="Replay the last hour of every train in 10 seconds"
            className="flex h-7 items-center gap-1.5 rounded-full border border-[#1c2a3e] bg-[#05080e] px-3 font-display text-[10px] font-bold uppercase tracking-[0.15em] text-[#5ecde0] transition-all hover:border-[#5ecde0] hover:text-[#8ee7f4] hover:shadow-[0_0_12px_rgba(94,205,224,0.35)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-[#1c2a3e] disabled:hover:text-[#5ecde0] disabled:hover:shadow-none"
          >
            {"▶▶ Replay 1h"}
          </button>

          <div className="flex min-w-[82px] flex-col items-end leading-none">
            <span
              className={`font-display text-[11px] font-bold uppercase tracking-[0.18em] ${
                viewMode.kind === "live" ? "text-[#64e2a4]" : "text-[#f0c565]"
              }`}
            >
              {label}
            </span>
            {absoluteTime ? (
              <span className="mt-0.5 text-[10px] text-[#5a6d82]">
                {absoluteTime}
              </span>
            ) : null}
          </div>
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
