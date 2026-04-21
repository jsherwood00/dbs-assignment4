// amtraker returns compass directions as text: "N", "NE", "E", ...
// Convert to degrees for rotating the marker. 0 = north (up).
const COMPASS: Record<string, number> = {
  N: 0,
  NE: 45,
  E: 90,
  SE: 135,
  S: 180,
  SW: 225,
  W: 270,
  NW: 315,
};

export function headingToDegrees(heading: string | null | undefined): number {
  if (!heading) return 0;
  return COMPASS[heading.toUpperCase()] ?? 0;
}
