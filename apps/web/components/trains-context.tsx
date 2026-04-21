"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getSupabase } from "@/lib/supabase";
import type { Train } from "@/lib/types";

export type ViewMode = { kind: "live" } | { kind: "history"; at: number };

interface TrainsState {
  trains: Train[];
  loading: boolean;
  error: string | null;
  lastUpdatedAt: number | null; // ms epoch — most recent last_updated across all trains
  viewMode: ViewMode;
  setViewMode: (m: ViewMode) => void;
}

const LIVE: ViewMode = { kind: "live" };

const TrainsContext = createContext<TrainsState | undefined>(undefined);

// Only show trains whose upstream data is reasonably fresh (10 min window).
const FRESH_WINDOW_MS = 10 * 60 * 1000;

interface HistoryRow {
  train_id: string;
  train_num: number | null;
  route_name: string | null;
  lat: number | null;
  lon: number | null;
  heading: string | null;
  velocity: number | null;
  status: string | null;
  snapshot_at: string;
}

export function TrainsProvider({ children }: { children: ReactNode }) {
  const [viewMode, setViewModeState] = useState<ViewMode>(LIVE);
  const [trains, setTrains] = useState<Train[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setViewMode = useCallback((m: ViewMode) => {
    setViewModeState(m);
  }, []);

  useEffect(() => {
    const supabase = getSupabase();
    let cancelled = false;

    if (viewMode.kind === "live") {
      setLoading(true);
      setError(null);

      const loadInitial = async () => {
        const since = new Date(Date.now() - FRESH_WINDOW_MS).toISOString();
        const { data, error: err } = await supabase
          .from("trains")
          .select("*")
          .gte("last_updated", since);
        if (cancelled) return;
        if (err) {
          setError(err.message);
          setLoading(false);
          return;
        }
        setTrains((data ?? []) as Train[]);
        setLoading(false);
      };

      loadInitial();

      const channel = supabase
        .channel("trains-live")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "trains" },
          (payload) => {
            setTrains((prev) => {
              const next = new Map(prev.map((t) => [t.id, t]));
              if (payload.eventType === "DELETE") {
                const oldId = (payload.old as { id?: string } | null)?.id;
                if (oldId) next.delete(oldId);
              } else {
                const row = payload.new as Train;
                if (row && row.id) next.set(row.id, row);
              }
              return Array.from(next.values());
            });
          },
        )
        .subscribe();

      return () => {
        cancelled = true;
        supabase.removeChannel(channel);
      };
    }

    // History mode: RPC fetch, no subscription.
    setLoading(true);
    setError(null);
    const targetISO = new Date(viewMode.at).toISOString();

    supabase
      .rpc("trains_at", { t: targetISO })
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) {
          setError(err.message);
          setTrains([]);
          setLoading(false);
          return;
        }
        const rows = (data ?? []) as HistoryRow[];
        const asTrains: Train[] = rows.map((r) => ({
          id: r.train_id,
          train_num: r.train_num ?? 0,
          route_name: r.route_name ?? "Unknown",
          lat: r.lat,
          lon: r.lon,
          heading: r.heading,
          velocity: r.velocity,
          status: r.status,
          origin_code: null,
          dest_code: null,
          stations: null, // not logged in history
          last_updated: r.snapshot_at,
        }));
        setTrains(asTrains);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [viewMode]);

  const lastUpdatedAt = useMemo(() => {
    let max = 0;
    for (const t of trains) {
      const ts = new Date(t.last_updated).getTime();
      if (ts > max) max = ts;
    }
    return max || null;
  }, [trains]);

  return (
    <TrainsContext.Provider
      value={{ trains, loading, error, lastUpdatedAt, viewMode, setViewMode }}
    >
      {children}
    </TrainsContext.Provider>
  );
}

export function useTrains() {
  const ctx = useContext(TrainsContext);
  if (!ctx) throw new Error("useTrains must be used within TrainsProvider");
  return ctx;
}
