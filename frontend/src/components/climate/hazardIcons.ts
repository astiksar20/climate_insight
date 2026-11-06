import type { HazardKind } from "@/lib/climate/hotspots";
import type { Level } from "@/lib/climate/analysis";

export const LEVEL_COLOR: Record<Level, string> = {
  green: "#16a34a",
  yellow: "#eab308",
  orange: "#f97316",
  red: "#dc2626",
};

const cloud = (fill: string) =>
  `<path d="M10 26a7 7 0 0 1 1-13.9A9 9 0 0 1 28.5 10 6.5 6.5 0 0 1 30 23H10z" fill="${fill}" stroke="#0f172a" stroke-opacity=".25" stroke-width="1"/>`;

/** Animated inline SVG for each hazard type (animations live in styles.css). */
export function hazardSvg(kind: HazardKind, level: Level): string {
  const c = LEVEL_COLOR[level];
  switch (kind) {
    case "tornado":
      return `<svg viewBox="0 0 40 40" class="hz-tornado"><g class="hz-spin">${[0, 1, 2, 3, 4, 5].map((i) => `<ellipse cx="${20 + (i % 2 ? 1.5 : -1.5)}" cy="${7 + i * 5}" rx="${15 - i * 2.3}" ry="2.4" fill="none" stroke="${c}" stroke-width="2.2" opacity="${1 - i * 0.08}"/>`).join("")}</g></svg>`;
    case "thunder":
    case "hail":
      return `<svg viewBox="0 0 40 40" class="hz-thunder">${cloud("#64748b")}<path class="hz-bolt" d="M21 22l-5 9h4l-2 7 7-10h-4l3-6z" fill="${c}"/>${kind === "hail" ? `<g class="hz-fall"><circle cx="11" cy="31" r="1.6" fill="#e2e8f0"/><circle cx="29" cy="33" r="1.6" fill="#e2e8f0"/></g>` : ""}</svg>`;
    case "rain":
      return `<svg viewBox="0 0 40 40">${cloud("#94a3b8")}<g class="hz-fall" stroke="${c}" stroke-width="2" stroke-linecap="round"><line x1="13" y1="29" x2="11" y2="34"/><line x1="20" y1="29" x2="18" y2="34"/><line x1="27" y1="29" x2="25" y2="34"/></g></svg>`;
    case "wind":
      return `<svg viewBox="0 0 40 40" class="hz-wind" fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round"><path d="M4 14h20a4 4 0 1 0-4-4"/><path d="M4 21h28a4 4 0 1 1-4 4"/><path d="M4 28h14"/></svg>`;
    case "heat":
      return `<svg viewBox="0 0 40 40" class="hz-heat"><circle cx="20" cy="20" r="8" fill="${c}"/><g class="hz-rays" stroke="${c}" stroke-width="2.4" stroke-linecap="round">${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<line x1="20" y1="5" x2="20" y2="9" transform="rotate(${a} 20 20)"/>`).join("")}</g></svg>`;
    case "cold":
    case "snow":
      return `<svg viewBox="0 0 40 40"><g class="hz-slowspin" stroke="${kind === "snow" ? "#38bdf8" : c}" stroke-width="2.2" stroke-linecap="round">${[0, 60, 120].map((a) => `<line x1="20" y1="6" x2="20" y2="34" transform="rotate(${a} 20 20)"/>`).join("")}</g></svg>`;
    case "fog":
      return `<svg viewBox="0 0 40 40" class="hz-fog" stroke="#94a3b8" stroke-width="2.6" stroke-linecap="round"><line x1="6" y1="14" x2="30" y2="14"/><line x1="10" y1="21" x2="34" y2="21"/><line x1="6" y1="28" x2="28" y2="28"/></svg>`;
    case "smog":
      return `<svg viewBox="0 0 40 40" class="hz-smog"><circle cx="15" cy="20" r="9" fill="${c}" opacity=".45"/><circle cx="25" cy="18" r="10" fill="${c}" opacity=".35"/><circle cx="21" cy="25" r="7" fill="${c}" opacity=".5"/></svg>`;
    default:
      return `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="5" fill="${c}" opacity=".85"/></svg>`;
  }
}
