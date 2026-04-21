import type { Train, SavedPair } from "./types";

// Does this train serve the pair (from -> to) in order?
// Direct service only — we require from to appear before to in the stations array.
export function trainServesPair(
  train: Train,
  fromCode: string,
  toCode: string,
): boolean {
  if (!train.stations || train.stations.length === 0) return false;
  const codes = train.stations.map((s) => s.code);
  const fromIdx = codes.indexOf(fromCode);
  const toIdx = codes.indexOf(toCode);
  return fromIdx !== -1 && toIdx !== -1 && fromIdx < toIdx;
}

export function trainMatchesAnyPair(
  train: Train,
  pairs: SavedPair[],
): SavedPair | null {
  for (const pair of pairs) {
    if (trainServesPair(train, pair.from_code, pair.to_code)) return pair;
  }
  return null;
}
