/**
 * Cleaning + fusion of live series with the synthetic baseline.
 *
 * 1. Coerce to number; drop non-finite, sentinel (-999) and physically impossible values.
 * 2. Linearly interpolate short interior gaps (≤ maxGap steps) — still counted as live.
 * 3. Fill whatever is left from the synthetic series, aligned by timestamp.
 */
export type Range = [number, number];

export const RANGES = {
  temp: [-60, 60] as Range,
  rh: [0, 100] as Range,
  precip: [0, 500] as Range,
  prob: [0, 100] as Range,
  wind: [0, 400] as Range,
  dir: [0, 360] as Range,
  pressure: [850, 1100] as Range,
  visibility: [0, 200000] as Range,
  uv: [0, 20] as Range,
  cape: [0, 10000] as Range,
  li: [-20, 30] as Range,
  cin: [-2000, 2000] as Range,
  height: [0, 12000] as Range,
  code: [0, 99] as Range,
  flag: [0, 1] as Range,
  snow: [0, 300] as Range,
  soil: [0, 1] as Range,
  conc: [0, 5000] as Range,
  aod: [0, 10] as Range,
  aqi: [0, 1000] as Range,
  discharge: [0, 500000] as Range,
  wave: [0, 30] as Range,
  et0: [0, 20] as Range,
};

export function cleanValues(
  raw: unknown[] | undefined,
  range: Range,
  maxGap = 6,
): (number | null)[] {
  if (!Array.isArray(raw)) return [];
  const v = raw.map((x) => {
    const n = typeof x === "number" ? x : x == null ? NaN : Number(x);
    if (!Number.isFinite(n) || n <= -998 || n < range[0] || n > range[1]) return null;
    return n;
  });
  // short-gap interpolation
  let i = 0;
  while (i < v.length) {
    if (v[i] !== null) {
      i++;
      continue;
    }
    let j = i;
    while (j < v.length && v[j] === null) j++;
    const gap = j - i;
    if (i > 0 && j < v.length && gap <= maxGap) {
      const a = v[i - 1]!,
        b = v[j]!;
      for (let k = i; k < j; k++) v[k] = a + ((b - a) * (k - i + 1)) / (gap + 1);
    }
    i = j;
  }
  return v;
}

export type MergeStats = { live: number; total: number };

/** Merge a live series (on liveTime axis) into a synthetic series (on axis). */
export function fuse(
  axis: string[],
  synth: number[],
  liveTime: string[] | undefined,
  liveRaw: unknown[] | undefined,
  range: Range,
  stats: MergeStats,
  opts: { round?: number; maxGap?: number } = {},
): number[] {
  const cleaned = cleanValues(liveRaw, range, opts.maxGap ?? 6);
  const idx = new Map<string, number>();
  (liveTime ?? []).forEach((t, i) => idx.set(t, i));
  const d = opts.round ?? 1;
  return axis.map((t, i) => {
    stats.total++;
    const j = idx.get(t);
    const lv = j === undefined ? null : cleaned[j];
    if (lv !== null && lv !== undefined) {
      stats.live++;
      return Math.round(lv * 10 ** d) / 10 ** d;
    }
    return synth[i];
  });
}

export function fuseStr(
  axis: string[],
  synth: string[],
  liveTime: string[] | undefined,
  live: unknown[] | undefined,
): string[] {
  const idx = new Map<string, number>();
  (liveTime ?? []).forEach((t, i) => idx.set(t, i));
  return axis.map((t, i) => {
    const j = idx.get(t);
    const v = j === undefined ? undefined : live?.[j];
    return typeof v === "string" && v.length >= 10 ? v : synth[i];
  });
}

export function share(s: MergeStats) {
  return s.total ? s.live / s.total : 0;
}
