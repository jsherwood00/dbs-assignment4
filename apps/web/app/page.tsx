"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { SavedTrainsPanel } from "@/components/saved-trains-panel";

const TrainMap = dynamic(() => import("@/components/train-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[#05080e] text-sm text-[#5a6d82]">
      Loading map…
    </div>
  ),
});

export default function HomePage() {
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [onlyFavorites, setOnlyFavorites] = useState(false);

  const handleSavedIdsChange = useCallback((next: Set<string>) => {
    setSavedIds(next);
  }, []);

  return (
    <div className="relative flex-1">
      <div className="absolute inset-0">
        <TrainMap savedIds={savedIds} onlyFavorites={onlyFavorites} />
      </div>
      <div className="pointer-events-none absolute right-4 top-4 z-[500] flex flex-col gap-3">
        <SavedTrainsPanel
          onSavedIdsChange={handleSavedIdsChange}
          onlyFavorites={onlyFavorites}
          onOnlyFavoritesChange={setOnlyFavorites}
        />
      </div>
    </div>
  );
}
