"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabase } from "@/lib/supabase";
import { useAuth } from "./auth-context";
import type { SavedPair } from "@/lib/types";

interface SavedPairsPanelProps {
  onPairsChange?: (pairs: SavedPair[]) => void;
}

export function SavedPairsPanel({ onPairsChange }: SavedPairsPanelProps) {
  const { user, loading } = useAuth();
  const [pairs, setPairs] = useState<SavedPair[]>([]);
  const [pairsLoading, setPairsLoading] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setPairs([]);
      onPairsChange?.([]);
      return;
    }
    let cancelled = false;
    setPairsLoading(true);
    getSupabase()
      .from("saved_pairs")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (cancelled) return;
        const rows = (data ?? []) as SavedPair[];
        setPairs(rows);
        onPairsChange?.(rows);
        setPairsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loading, user, onPairsChange]);

  const deletePair = async (id: string) => {
    const { error } = await getSupabase()
      .from("saved_pairs")
      .delete()
      .eq("id", id);
    if (error) return;
    setPairs((prev) => {
      const next = prev.filter((p) => p.id !== id);
      onPairsChange?.(next);
      return next;
    });
  };

  if (loading) return null;

  if (!user) {
    return (
      <aside className="pointer-events-auto w-72 rounded-xl border border-[#1c2a3e] bg-[#0d1520]/95 p-4 shadow-xl backdrop-blur">
        <div className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-[#5ecde0]">
          Saved Routes
        </div>
        <p className="mt-2 text-sm text-[#d8e4f0]">
          Log in to save station pairs and see your trips highlighted on the
          map.
        </p>
        <div className="mt-3 flex gap-2">
          <Link
            href="/login"
            className="flex-1 rounded-md border border-[#1c2a3e] px-3 py-1.5 text-center text-xs text-[#d8e4f0] hover:border-[#5ecde0] hover:text-[#5ecde0]"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="flex-1 rounded-md bg-[#5ecde0] px-3 py-1.5 text-center text-xs font-medium text-[#05080e] hover:bg-[#8ee7f4]"
          >
            Sign up
          </Link>
        </div>
      </aside>
    );
  }

  return (
    <aside className="pointer-events-auto w-80 rounded-xl border border-[#1c2a3e] bg-[#0d1520]/95 p-4 shadow-xl backdrop-blur">
      <div className="flex items-center justify-between">
        <div className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-[#5ecde0]">
          Saved Routes
        </div>
        <Link
          href="/search"
          className="text-xs text-[#5ecde0] hover:underline"
        >
          + Add
        </Link>
      </div>

      {pairsLoading ? (
        <p className="mt-2 text-sm text-[#5a6d82]">Loading…</p>
      ) : pairs.length === 0 ? (
        <p className="mt-2 text-sm text-[#5a6d82]">
          No saved pairs yet. Head to{" "}
          <Link href="/search" className="text-[#5ecde0] hover:underline">
            Search
          </Link>{" "}
          to find a direct route and save it.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {pairs.map((p) => (
            <li
              key={p.id}
              className="group flex items-center justify-between gap-2 rounded-md border border-[#1c2a3e] bg-[#05080e] px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-[#d8e4f0]">
                  <span className="font-medium">{p.from_code}</span>
                  <span className="mx-1.5 text-[#5a6d82]">→</span>
                  <span className="font-medium">{p.to_code}</span>
                </div>
                <div className="truncate text-[11px] text-[#5a6d82]">
                  {p.from_name} → {p.to_name}
                </div>
              </div>
              <button
                type="button"
                onClick={() => deletePair(p.id)}
                aria-label={`Delete ${p.from_code} → ${p.to_code}`}
                title="Delete"
                className="rounded p-1 text-[#5a6d82] opacity-0 transition-opacity hover:bg-[#1c2a3e] hover:text-[#ef4c4c] group-hover:opacity-100"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
