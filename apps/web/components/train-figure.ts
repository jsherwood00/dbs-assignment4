// Pure helpers that produce HTML strings for Leaflet divIcons & popups.
// Kept out of React so the imperative marker layer can use them directly.

import type { SavedPair, Train } from "@/lib/types";

export function buildTrainFigureHTML(
  headingDeg: number,
  saved: boolean,
  moving: boolean,
  ghost: boolean = false,
): string {
  const classes = [
    "train-figure",
    saved ? "train-figure--saved" : "",
    moving ? "train-figure--moving" : "",
    ghost ? "is-ghost" : "",
  ]
    .filter(Boolean)
    .join(" ");

  // Rotate by headingDeg - 90 because the SVG train points east (right); heading 0 = north.
  const rotate = headingDeg - 90;

  return `
    <div class="${classes}" style="--rot: ${rotate}deg;">
      <svg viewBox="0 0 48 32" width="100%" height="100%" aria-hidden="true">
        <!-- wheels -->
        <circle cx="11" cy="27" r="3" fill="currentColor"/>
        <circle cx="22" cy="27" r="4" fill="currentColor"/>
        <circle cx="33" cy="27" r="3" fill="currentColor"/>
        <!-- cab -->
        <rect x="4" y="10" width="12" height="16" rx="1.5" fill="currentColor"/>
        <!-- boiler -->
        <rect x="14" y="14" width="26" height="12" rx="2" fill="currentColor"/>
        <!-- headlight bulge -->
        <rect x="38" y="16" width="4" height="8" rx="1" fill="currentColor"/>
        <!-- dome -->
        <rect x="19" y="10" width="5" height="4" rx="1" fill="currentColor"/>
        <!-- smokestack -->
        <rect x="29" y="5" width="5" height="9" fill="currentColor"/>
        <!-- smokestack cap -->
        <rect x="27" y="4" width="9" height="2" rx="1" fill="currentColor"/>
        <!-- cab window -->
        <rect x="6" y="13" width="7" height="6" rx="0.5" fill="#05080e" opacity="0.85"/>
        <!-- headlight dot -->
        <circle cx="41" cy="20" r="1" fill="#fde68a"/>
        <!-- steam (only visible when .train-figure--moving) -->
        <g class="train-figure__steam">
          <circle class="train-figure__puff train-figure__puff--1" cx="31" cy="4" r="2.5"/>
          <circle class="train-figure__puff train-figure__puff--2" cx="31" cy="4" r="3"/>
          <circle class="train-figure__puff train-figure__puff--3" cx="31" cy="4" r="2"/>
        </g>
      </svg>
    </div>
  `;
}

export function buildPopupHTML(train: Train, matchedPair: SavedPair | null): string {
  const nextStation = findNextStation(train);
  const delayMinutes = computeDelayMinutes(train);

  const statusBadge = train.status
    ? `<span class="amtrak-badge">${escape(train.status)}</span>`
    : "";

  const savedBadge = matchedPair
    ? `<div class="amtrak-saved-pill">Serves your saved pair: ${escape(matchedPair.from_code)} → ${escape(matchedPair.to_code)}</div>`
    : "";

  const velocity =
    typeof train.velocity === "number"
      ? `<div class="amtrak-muted">${Math.round(train.velocity)} mph</div>`
      : "";

  const next = nextStation
    ? `<div><span class="amtrak-muted">Next:</span> ${escape(nextStation.name)} <span class="amtrak-muted">(${escape(nextStation.code)})</span></div>`
    : "";

  let delay = "";
  if (delayMinutes !== null) {
    const cls =
      delayMinutes > 5
        ? "amtrak-delay-late"
        : delayMinutes < -5
          ? "amtrak-delay-early"
          : "amtrak-muted";
    const text =
      delayMinutes === 0
        ? "On time"
        : `${delayMinutes > 0 ? "+" : ""}${delayMinutes} min`;
    delay = `<div class="${cls}">${escape(text)}</div>`;
  }

  return `
    <div class="amtrak-popup">
      <div class="amtrak-popup__header">
        <div class="amtrak-popup__title">
          ${escape(train.route_name)}
          <span class="amtrak-muted">#${train.train_num}</span>
        </div>
        ${statusBadge}
      </div>
      <div class="amtrak-muted">
        ${escape(train.origin_code ?? "?")} → ${escape(train.dest_code ?? "?")}
      </div>
      ${savedBadge}
      ${velocity}
      ${next}
      ${delay}
      <button
        type="button"
        class="amtrak-replay-btn"
        data-amtrak-replay="${escape(train.id)}"
      >
        ▶ Replay last hour
      </button>
    </div>
  `;
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

function computeDelayMinutes(train: Train): number | null {
  if (!train.stations) return null;
  for (const s of train.stations) {
    const actual = s.arr || s.dep;
    const scheduled = s.schArr || s.schDep;
    if (!actual || !scheduled) continue;
    const a = new Date(actual).getTime();
    const sc = new Date(scheduled).getTime();
    if (
      Number.isFinite(a) &&
      Number.isFinite(sc) &&
      a > Date.now() - 48 * 60 * 60 * 1000
    ) {
      return Math.round((a - sc) / 60000);
    }
  }
  return null;
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
