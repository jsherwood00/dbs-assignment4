"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { StationAutocomplete } from "@/components/station-autocomplete";
import { useTrains } from "@/components/trains-context";
import { useAuth } from "@/components/auth-context";
import { trainServesPair } from "@/lib/pair";
import { getSupabase } from "@/lib/supabase";
import type { AmtrakerStation, SavedPair, Train } from "@/lib/types";

export default function SearchPage() {
  const { user } = useAuth();
  const { trains } = useTrains();
  const [from, setFrom] = useState<AmtrakerStation | null>(null);
  const [to, setTo] = useState<AmtrakerStation | null>(null);
  const [savedPairs, setSavedPairs] = useState<SavedPair[]>([]);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load this user's saved pairs (to show star state correctly).
  useEffect(() => {
    if (!user) {
      setSavedPairs([]);
      return;
    }
    let cancelled = false;
    getSupabase()
      .from("saved_pairs")
      .select("*")
      .eq("user_id", user.id)
      .then(({ data }) => {
        if (cancelled) return;
        setSavedPairs((data ?? []) as SavedPair[]);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const swap = () => {
    setFrom(to);
    setTo(from);
  };

  const results = useMemo(() => {
    if (!from || !to) return [];
    return trains
      .filter((t) => trainServesPair(t, from.code, to.code))
      .sort((a, b) => a.train_num - b.train_num);
  }, [trains, from, to]);

  const pairSaved = !!(
    user &&
    from &&
    to &&
    savedPairs.some(
      (p) => p.from_code === from.code && p.to_code === to.code,
    )
  );

  const savePair = async () => {
    if (!user || !from || !to) return;
    const key = `${from.code}-${to.code}`;
    setSavingKey(key);
    setError(null);
    try {
      const existing = savedPairs.find(
        (p) => p.from_code === from.code && p.to_code === to.code,
      );
      if (existing) {
        const { error } = await getSupabase()
          .from("saved_pairs")
          .delete()
          .eq("id", existing.id);
        if (error) throw error;
        setSavedPairs((prev) => prev.filter((p) => p.id !== existing.id));
      } else {
        const { data, error } = await getSupabase()
          .from("saved_pairs")
          .insert({
            user_id: user.id,
            from_code: from.code,
            from_name: from.name,
            to_code: to.code,
            to_name: to.name,
          })
          .select()
          .single();
        if (error) throw error;
        if (data) setSavedPairs((prev) => [data as SavedPair, ...prev]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
      <div className="rounded-xl border border-[#1f2b45] bg-[#131d31] p-5 shadow-lg">
        <h1 className="text-lg font-semibold tracking-tight text-[#e5edf7]">
          Find direct service
        </h1>
        <p className="mt-1 text-sm text-[#7b89a1]">
          Enter two stations — we&apos;ll show every active train that serves
          both in order.
        </p>

        <div className="mt-4 grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <StationAutocomplete
            label="From"
            value={from}
            onChange={setFrom}
            placeholder="e.g. Chicago (CHI)"
          />
          <button
            type="button"
            onClick={swap}
            aria-label="Swap from and to"
            title="Swap"
            className="mb-[1px] inline-flex h-[38px] items-center justify-center rounded-md border border-[#1f2b45] bg-[#0b1220] px-3 text-[#7b89a1] hover:border-[#3a7afe] hover:text-[#3a7afe] sm:self-end"
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M7 16V4m0 0l-3 3m3-3l3 3M17 8v12m0 0l-3-3m3 3l3-3" />
            </svg>
          </button>
          <StationAutocomplete
            label="To"
            value={to}
            onChange={setTo}
            placeholder="e.g. New York Penn (NYP)"
          />
        </div>

        {from && to ? (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-md border border-[#1f2b45] bg-[#0b1220] px-3 py-2">
            <div className="text-sm text-[#e5edf7]">
              <span className="font-medium">{from.code}</span>{" "}
              <span className="text-[#7b89a1]">→</span>{" "}
              <span className="font-medium">{to.code}</span>{" "}
              <span className="text-[#7b89a1]">
                ({results.length}{" "}
                {results.length === 1 ? "direct train" : "direct trains"})
              </span>
            </div>
            {user ? (
              <button
                type="button"
                onClick={savePair}
                disabled={savingKey === `${from.code}-${to.code}`}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors disabled:opacity-60 ${
                  pairSaved
                    ? "border border-[#3a3322] bg-[#1c1810] text-[#f5a524]"
                    : "border border-[#1f2b45] bg-[#131d31] text-[#e5edf7] hover:border-[#3a7afe] hover:text-[#3a7afe]"
                }`}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  fill={pairSaved ? "currentColor" : "none"}
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                {pairSaved ? "Saved" : "Save pair"}
              </button>
            ) : (
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 rounded-md border border-[#1f2b45] bg-[#131d31] px-3 py-1.5 text-sm text-[#e5edf7] hover:border-[#3a7afe] hover:text-[#3a7afe]"
              >
                Log in to save
              </Link>
            )}
          </div>
        ) : null}

        {error ? (
          <div className="mt-3 rounded-md border border-[#3a2a2a] bg-[#1a1212] px-3 py-2 text-sm text-[#f87171]">
            {error}
          </div>
        ) : null}
      </div>

      <div className="mt-6 space-y-2">
        {from && to && results.length === 0 ? (
          <div className="rounded-md border border-[#1f2b45] bg-[#131d31] px-4 py-6 text-center text-sm text-[#7b89a1]">
            No direct service found for this pair right now. Try a different
            combination — or come back later, since this shows only trains
            currently running.
          </div>
        ) : null}

        {results.map((t) => (
          <TrainResultCard
            key={t.id}
            train={t}
            from={from!.code}
            to={to!.code}
          />
        ))}
      </div>
    </div>
  );
}

function TrainResultCard({
  train,
  from,
  to,
}: {
  train: Train;
  from: string;
  to: string;
}) {
  const next = findNextStation(train);
  return (
    <div className="rounded-md border border-[#1f2b45] bg-[#131d31] px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-sm font-semibold text-[#e5edf7]">
          {train.route_name}{" "}
          <span className="font-normal text-[#7b89a1]">#{train.train_num}</span>
        </div>
        {train.status ? (
          <span className="rounded-full border border-[#1f2b45] px-2 py-0.5 text-[10px] uppercase tracking-wider text-[#7b89a1]">
            {train.status}
          </span>
        ) : null}
      </div>
      <div className="mt-1 text-xs text-[#7b89a1]">
        {train.origin_code} → {train.dest_code}{" "}
        <span className="mx-1">·</span>
        <span className="text-[#f5a524]">
          serves {from} → {to}
        </span>
        {typeof train.velocity === "number" ? (
          <>
            {" "}
            <span className="mx-1">·</span>
            {Math.round(train.velocity)} mph
          </>
        ) : null}
        {next ? (
          <>
            {" "}
            <span className="mx-1">·</span>
            next: {next.name} ({next.code})
          </>
        ) : null}
      </div>
    </div>
  );
}

function findNextStation(train: Train) {
  if (!train.stations) return null;
  const now = Date.now();
  for (const s of train.stations) {
    const ts = s.arr || s.schArr || s.dep || s.schDep;
    if (!ts) continue;
    const t = new Date(ts).getTime();
    if (Number.isFinite(t) && t >= now) return s;
  }
  return null;
}
