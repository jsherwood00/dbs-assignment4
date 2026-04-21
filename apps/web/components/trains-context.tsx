"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getSupabase } from "@/lib/supabase";
import type { Train } from "@/lib/types";

interface TrainsState {
  trains: Train[];
  loading: boolean;
  error: string | null;
  lastUpdatedAt: number | null; // ms epoch — most recent last_updated across all trains
}

const TrainsContext = createContext<TrainsState | undefined>(undefined);

// Only show trains whose upstream data is reasonably fresh (10 min window).
const FRESH_WINDOW_MS = 10 * 60 * 1000;

export function TrainsProvider({ children }: { children: ReactNode }) {
  const [trains, setTrains] = useState<Train[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastFetchedAt = useRef(0);

  useEffect(() => {
    const supabase = getSupabase();
    let cancelled = false;

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
      lastFetchedAt.current = Date.now();
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
  }, []);

  const lastUpdatedAt = useMemo(() => {
    let max = 0;
    for (const t of trains) {
      const ts = new Date(t.last_updated).getTime();
      if (ts > max) max = ts;
    }
    return max || null;
  }, [trains]);

  return (
    <TrainsContext.Provider value={{ trains, loading, error, lastUpdatedAt }}>
      {children}
    </TrainsContext.Provider>
  );
}

export function useTrains() {
  const ctx = useContext(TrainsContext);
  if (!ctx) throw new Error("useTrains must be used within TrainsProvider");
  return ctx;
}
