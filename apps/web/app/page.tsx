"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { SavedPairsPanel } from "@/components/saved-pairs-panel";
import type { SavedPair } from "@/lib/types";

const TrainMap = dynamic(() => import("@/components/train-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[#05080e] text-sm text-[#5a6d82]">
      Loading map…
    </div>
  ),
});

export default function HomePage() {
  const [pairs, setPairs] = useState<SavedPair[]>([]);
  const handlePairsChange = useCallback((next: SavedPair[]) => {
    setPairs(next);
  }, []);

  return (
    <div className="relative flex-1">
      <div className="absolute inset-0">
        <TrainMap savedPairs={pairs} />
      </div>
      <div className="pointer-events-none absolute right-4 top-4 z-[500] flex flex-col gap-3">
        <SavedPairsPanel onPairsChange={handlePairsChange} />
      </div>
    </div>
  );
}
