"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { loadStations, searchStations } from "@/lib/stations";
import type { AmtrakerStation } from "@/lib/types";

interface Props {
  label: string;
  value: AmtrakerStation | null;
  onChange: (next: AmtrakerStation | null) => void;
  placeholder?: string;
}

export function StationAutocomplete({
  label,
  value,
  onChange,
  placeholder,
}: Props) {
  const [stations, setStations] = useState<AmtrakerStation[]>([]);
  const [query, setQuery] = useState(value ? displayLabel(value) : "");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadStations()
      .then((list) => {
        if (!cancelled) setStations(list);
      })
      .catch(() => {
        // silent — user can still type a 3-letter code if needed
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep the query in sync when the caller updates `value` externally (e.g. swap).
  useEffect(() => {
    setQuery(value ? displayLabel(value) : "");
  }, [value]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const matches = useMemo(() => {
    if (!query) return [];
    // If the query exactly matches the current value's display, don't show suggestions.
    if (value && query === displayLabel(value)) return [];
    return searchStations(stations, query, 8);
  }, [stations, query, value]);

  const select = (s: AmtrakerStation) => {
    onChange(s);
    setQuery(displayLabel(s));
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open || matches.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      select(matches[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <label className="block">
        <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-[#5a6d82]">
          {label}
        </span>
        <input
          type="text"
          value={query}
          placeholder={placeholder ?? "Station name or 3-letter code"}
          autoComplete="off"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setHighlight(0);
            if (value) onChange(null);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="w-full rounded-md border border-[#1c2a3e] bg-[#05080e] px-3 py-2 text-sm text-[#d8e4f0] outline-none transition-colors placeholder:text-[#3a4a5e] focus:border-[#5ecde0]"
        />
      </label>
      {open && matches.length > 0 ? (
        <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-md border border-[#1c2a3e] bg-[#0d1520] shadow-xl">
          {matches.map((s, i) => (
            <li key={s.code}>
              <button
                type="button"
                onMouseEnter={() => setHighlight(i)}
                onMouseDown={(e) => {
                  e.preventDefault(); // keep focus on input
                  select(s);
                }}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm ${
                  i === highlight
                    ? "bg-[#1c2a3e] text-[#d8e4f0]"
                    : "text-[#d8e4f0] hover:bg-[#1c2a3e]"
                }`}
              >
                <span className="truncate">{s.name}</span>
                <span className="font-mono text-[11px] text-[#5a6d82]">
                  {s.code}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function displayLabel(s: AmtrakerStation): string {
  return `${s.name} (${s.code})`;
}
