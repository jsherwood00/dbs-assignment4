"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getSupabase } from "@/lib/supabase";
import { useAuth } from "./auth-context";
import { useTrains } from "./trains-context";
import type { SavedTrain, Train } from "@/lib/types";

interface SavedTrainsPanelProps {
  onSavedIdsChange?: (ids: Set<string>) => void;
  onlyFavorites: boolean;
  onOnlyFavoritesChange: (v: boolean) => void;
}

export function SavedTrainsPanel({
  onSavedIdsChange,
  onlyFavorites,
  onOnlyFavoritesChange,
}: SavedTrainsPanelProps) {
  const { user, loading } = useAuth();
  const { trains } = useTrains();
  const [savedRows, setSavedRows] = useState<SavedTrain[]>([]);
  const [listLoading, setListLoading] = useState(false);

  // Memoized Set<string> of train_ids the user has favorited.
  const savedIds = useMemo(
    () => new Set(savedRows.map((r) => r.train_id)),
    [savedRows],
  );

  // Publish the set up to the page so the map can filter / recolor.
  useEffect(() => {
    onSavedIdsChange?.(savedIds);
  }, [savedIds, onSavedIdsChange]);

  // Load the user's saved trains on sign-in. Also subscribe to changes
  // so that clicking the favorite button in a popup updates this list
  // without a manual refetch — we react to Realtime-less DB inserts/
  // deletes triggered by the delegated popup button handler.
  const refetch = useCallback(async () => {
    if (!user) return;
    setListLoading(true);
    const { data } = await getSupabase()
      .from("saved_trains")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setSavedRows((data ?? []) as SavedTrain[]);
    setListLoading(false);
  }, [user]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setSavedRows([]);
      return;
    }
    refetch();
  }, [loading, user, refetch]);

  // Popup button and other sources can dispatch this when they've
  // mutated saved_trains, so we re-pull.
  useEffect(() => {
    const handler = () => refetch();
    window.addEventListener("amtrak:favorites-changed", handler);
    return () => window.removeEventListener("amtrak:favorites-changed", handler);
  }, [refetch]);

  const unfavorite = async (row: SavedTrain) => {
    const { error } = await getSupabase()
      .from("saved_trains")
      .delete()
      .eq("id", row.id);
    if (error) return;
    setSavedRows((prev) => prev.filter((r) => r.id !== row.id));
  };

  if (loading) return null;

  // ---- Signed-out: marketing pitch, only "Sign up" CTA.
  if (!user) {
    return (
      <aside className="pointer-events-auto w-72 rounded-xl border border-[#1c2a3e] bg-[#0d1520]/95 p-4 shadow-xl backdrop-blur">
        <div className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-[#5ecde0]">
          Track your favorites
        </div>
        <p className="mt-2 text-sm text-[#d8e4f0]">
          Sign up to favorite specific Amtrak trains. Your favorites turn
          <span className="text-[#10e070] font-semibold"> green on the map</span>,
          so you can spot them at a glance and filter out the rest.
        </p>
        <Link
          href="/signup"
          className="mt-3 block rounded-md bg-[#5ecde0] px-3 py-1.5 text-center text-xs font-medium text-[#05080e] hover:bg-[#8ee7f4]"
        >
          Sign up free
        </Link>
      </aside>
    );
  }

  // ---- Signed-in: list of favorites + only-favorites toggle.
  const trainById = new Map<string, Train>(trains.map((t) => [t.id, t]));

  return (
    <aside className="pointer-events-auto w-80 rounded-xl border border-[#1c2a3e] bg-[#0d1520]/95 p-4 shadow-xl backdrop-blur">
      <div className="flex items-center justify-between">
        <div className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-[#10e070]">
          Favorites
        </div>
        <span className="text-[11px] text-[#5a6d82]">
          {savedRows.length}
        </span>
      </div>

      {/* Only-favorites toggle */}
      <label
        className={`mt-3 flex cursor-pointer items-center justify-between gap-2 rounded-md border px-3 py-2 text-[11px] uppercase tracking-[0.12em] transition-colors ${
          onlyFavorites
            ? "border-[#10e070] bg-[rgba(16,224,112,0.1)] text-[#b3ffc4]"
            : "border-[#1c2a3e] bg-[#05080e] text-[#5a6d82] hover:text-[#d8e4f0]"
        }`}
      >
        <span>Only show favorites</span>
        <input
          type="checkbox"
          className="sr-only"
          checked={onlyFavorites}
          onChange={(e) => onOnlyFavoritesChange(e.target.checked)}
        />
        <span
          aria-hidden
          className={`relative inline-block h-4 w-7 rounded-full transition-colors ${
            onlyFavorites ? "bg-[#10e070]" : "bg-[#1c2a3e]"
          }`}
        >
          <span
            className={`absolute top-0.5 inline-block h-3 w-3 rounded-full bg-[#d8e4f0] transition-all ${
              onlyFavorites ? "left-3.5" : "left-0.5"
            }`}
          />
        </span>
      </label>

      {listLoading ? (
        <p className="mt-3 text-sm text-[#5a6d82]">Loading…</p>
      ) : savedRows.length === 0 ? (
        <p className="mt-3 text-sm text-[#5a6d82]">
          No favorites yet. Click a train on the map and hit{" "}
          <span className="text-[#10e070]">☆ Favorite this train</span>.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {savedRows.map((row) => {
            const t = trainById.get(row.train_id);
            return (
              <li
                key={row.id}
                className="group flex items-center justify-between gap-2 rounded-md border border-[#1c2a3e] bg-[#05080e] px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-[#d8e4f0]">
                    <span className="text-[#10e070]">★</span>{" "}
                    {t ? (
                      <>
                        <span className="font-medium">{t.route_name}</span>
                        <span className="ml-1.5 text-[#5a6d82]">
                          #{t.train_num}
                        </span>
                      </>
                    ) : (
                      <span className="font-mono text-[11px]">
                        {row.train_id}
                      </span>
                    )}
                  </div>
                  {t ? (
                    <div className="truncate text-[11px] text-[#5a6d82]">
                      {t.origin_code ?? "?"} → {t.dest_code ?? "?"}{" "}
                      {t.status ? `· ${t.status}` : ""}
                    </div>
                  ) : (
                    <div className="truncate text-[11px] text-[#5a6d82]">
                      Not currently on the map
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => unfavorite(row)}
                  aria-label="Remove favorite"
                  title="Remove favorite"
                  className="rounded p-1 text-[#5a6d82] opacity-0 transition-opacity hover:bg-[#1c2a3e] hover:text-[#10e070] group-hover:opacity-100"
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
            );
          })}
        </ul>
      )}
    </aside>
  );
}
