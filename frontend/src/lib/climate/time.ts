/** Time helpers. All app times are India Standard Time (UTC+05:30), matching timezone=Asia/Kolkata requests. */
const IST_MS = 5.5 * 3600 * 1000;

export function istNow(): Date {
  return new Date(Date.now() + IST_MS); // read with getUTC* methods
}
export function istHourKey(d = istNow()): string {
  return d.toISOString().slice(0, 13) + ":00";
}
export function istDateKey(d = istNow()): string {
  return d.toISOString().slice(0, 10);
}
export function addDays(dateKey: string, n: number): string {
  const d = new Date(dateKey + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function dayOfYear(dateKey: string): number {
  const d = new Date(dateKey.slice(0, 10) + "T00:00:00Z");
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.floor((d.getTime() - start) / 86400000) + 1;
}
export function hourOf(key: string): number {
  return Number(key.slice(11, 13));
}
export function hourlyAxis(startDate: string, days: number): string[] {
  const out: string[] = [];
  for (let d = 0; d < days; d++) {
    const dk = addDays(startDate, d);
    for (let h = 0; h < 24; h++) out.push(`${dk}T${String(h).padStart(2, "0")}:00`);
  }
  return out;
}
export function dailyAxis(startDate: string, days: number): string[] {
  return Array.from({ length: days }, (_, i) => addDays(startDate, i));
}
export const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Interpolate a 12-month normal to a given day of year (values centred mid-month). */
export function monthlyAt(normal: number[], doy: number): number {
  const m = ((doy - 15.2) / 30.44 + 12) % 12;
  const i = Math.floor(m),
    f = m - i;
  return normal[i] * (1 - f) + normal[(i + 1) % 12] * f;
}

export function fmtDay(dateKey: string): string {
  const d = new Date(dateKey.slice(0, 10) + "T00:00:00Z");
  return d.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}
export function fmtHour(key: string): string {
  const h = hourOf(key);
  const s = h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`;
  return s;
}
