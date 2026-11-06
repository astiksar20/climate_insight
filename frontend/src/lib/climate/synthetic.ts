/**
 * Synthetic climate model for India.
 *
 * Produces a complete, physically plausible dataset for any coordinate so that no
 * field in the UI is ever empty. It is seeded by location + date, so values are
 * stable between reloads. Live data replaces these values wherever it exists;
 * every section is tagged with its provenance.
 *
 * Built from published regional climatology patterns (IMD normals: lapse rate,
 * latitude/continentality effects, SW + NE monsoon timing, western disturbances).
 */
import type {
  AirData,
  DailyData,
  FloodData,
  History,
  HourlyData,
  MarineData,
  Normals,
  Projections,
  RecentDaily,
} from "./types";
import { regionOf, type Region } from "./geo";
import { addDays, dailyAxis, dayOfYear, hourOf, monthlyAt } from "./time";

/* ---------------- deterministic randomness ---------------- */
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function rng(seed: string) {
  let a = hashStr(seed);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(r: () => number) {
  const u = Math.max(1e-9, r()),
    v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const round = (x: number, d = 1) => Math.round(x * 10 ** d) / 10 ** d;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/* ---------------- monthly normals ---------------- */
const SW_MONSOON = [0.5, 0.6, 1, 1.5, 3, 15, 27, 24, 14, 6, 2, 0.6];
const NE_MONSOON = [3, 1, 1, 2, 4, 5, 8, 10, 11, 22, 26, 12];
const NE_INDIA = [1, 2, 5, 10, 14, 18, 18, 15, 11, 5, 1, 0.5];
const WESTERN_DIST = [9, 11, 13, 10, 7, 5, 9, 9, 5, 3, 3, 6];
const HIMALAYA = [5, 6, 6, 4, 5, 13, 22, 21, 11, 3, 1, 3];
const TEMP_SHAPE = [-1, -0.75, -0.25, 0.35, 0.85, 1.0, 0.7, 0.6, 0.5, 0.15, -0.4, -0.85];

function annualRain(lat: number, lon: number, r: Region): number {
  switch (r) {
    case "ladakh":
      return 110;
    case "kashmir":
      return lat > 33.5 ? 720 : 1300;
    case "himalaya":
      return 1650;
    case "northeast":
      return lat < 26 && lon < 92.5 && lat > 25 ? 4000 : 2300;
    case "thar":
      return clamp(150 + 100 * (lon - 69.5), 150, 700);
    case "northwest-plains":
      return 550 + 60 * (lon - 74);
    case "gangetic":
      return clamp(600 + 70 * (lon - 75), 650, 1800);
    case "central":
      return clamp(800 + 70 * (lon - 74), 700, 1500);
    case "deccan":
      return clamp(650 + 55 * (lon - 74), 550, 1100);
    case "westcoast":
      return 2900;
    case "eastcoast":
      return lat > 17 ? 1150 : 950;
    case "tamilnadu":
      return 1100;
    case "south-interior":
      return lon < 76.5 ? 1500 : 850;
    case "islands":
      return lon > 91 ? 3000 : 1600;
  }
}

function rainShape(lat: number, lon: number, r: Region): number[] {
  if (r === "tamilnadu" || (r === "eastcoast" && lat < 15)) return NE_MONSOON;
  if (r === "kashmir" || r === "ladakh") return WESTERN_DIST;
  if (r === "northeast") return NE_INDIA;
  if (r === "himalaya") return HIMALAYA;
  if (r === "islands" && lon > 91) return [3, 1, 1, 4, 13, 15, 13, 13, 14, 11, 9, 4];
  if (r === "south-interior") return [0.5, 0.5, 1.5, 4, 8, 12, 14, 12, 15, 17, 10, 3];
  return SW_MONSOON;
}

export function syntheticNormals(lat: number, lon: number, elev: number, coastKm: number): Normals {
  const r = regionOf(lat, lon);
  const coastal = coastKm < 60;
  const arid = r === "thar" || r === "ladakh";
  const T0 = 28.5 - 0.22 * Math.max(0, lat - 12) - 0.0058 * elev;
  let A = 1.5 + 0.55 * Math.max(0, lat - 10);
  if (coastal) A *= 0.55;
  if (r === "northeast") A *= 0.75;
  const P = annualRain(lat, lon, r);
  const shape = rainShape(lat, lon, r);
  const ssum = shape.reduce((a, b) => a + b, 0);
  const precip = shape.map((s) => round((P * s) / ssum, 0));
  const shapeMean = TEMP_SHAPE.reduce((a, b) => a + b, 0) / 12;
  const tmean = TEMP_SHAPE.map((s, m) => {
    let t = T0 + A * (s - shapeMean);
    // monsoon cloud/rain cooling
    t -= clamp(precip[m] / 250, 0, 2.5);
    return round(t);
  });
  const dtr = precip.map((p, m) => {
    let d = 11 + (arid ? 4 : 0) - (coastal ? 4 : 0) - clamp(p / 90, 0, 5);
    if (r === "himalaya" || r === "kashmir") d -= 1;
    if (m <= 1 || m >= 10) d += 1;
    return clamp(d, 4, 17);
  });
  const tmax = tmean.map((t, m) => round(t + dtr[m] / 2));
  const tmin = tmean.map((t, m) => round(t - dtr[m] / 2));
  const rh = precip.map((p) =>
    round(
      clamp(38 + 42 * (1 - Math.exp(-p / 130)) + (coastal ? 14 : 0) - (arid ? 10 : 0), 15, 92),
      0,
    ),
  );
  const wind = precip.map((p, m) =>
    round(
      (2.4 +
        (coastal ? 1.6 : 0) +
        (m >= 5 && m <= 8 ? 1.2 : 0) +
        (r === "thar" && m >= 3 && m <= 6 ? 1.5 : 0)) *
        3.6,
    ),
  );
  const solar = precip.map((p, m) =>
    round(
      clamp(
        5.6 +
          (m >= 2 && m <= 4 ? 0.8 : 0) -
          p / 380 -
          (Math.abs(m - 5.5) > 4 ? 0.006 * (lat - 8) * 10 : 0),
        2.5,
        7.5,
      ),
      2,
    ),
  );
  return { tmean, tmax, tmin, precip, rh, wind, solar };
}

/* ---------------- astronomy ---------------- */
function declination(doy: number) {
  return 23.44 * Math.sin(((2 * Math.PI) / 365) * (doy - 81));
}
function eot(doy: number) {
  const B = ((2 * Math.PI) / 364) * (doy - 81);
  return 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
}
/** Sunrise/sunset in IST decimal hours. */
export function sunTimes(lat: number, lon: number, dateKey: string) {
  const doy = dayOfYear(dateKey),
    r = Math.PI / 180;
  const dec = declination(doy) * r;
  const cosH =
    (Math.sin(-0.833 * r) - Math.sin(lat * r) * Math.sin(dec)) /
    (Math.cos(lat * r) * Math.cos(dec));
  const H = Math.acos(clamp(cosH, -1, 1)) / r / 15;
  const noon = 12 - eot(doy) / 60 - (lon - 82.5) / 15;
  return { rise: noon - H, set: noon + H, noon };
}
export function solarElevation(lat: number, lon: number, dateKey: string, hourIST: number) {
  const doy = dayOfYear(dateKey),
    r = Math.PI / 180;
  const dec = declination(doy) * r;
  const { noon } = sunTimes(lat, lon, dateKey);
  const ha = (hourIST - noon) * 15 * r;
  return (
    Math.asin(
      Math.sin(lat * r) * Math.sin(dec) + Math.cos(lat * r) * Math.cos(dec) * Math.cos(ha),
    ) / r
  );
}
const hhmm = (dateKey: string, h: number) => {
  const hh = Math.floor(h),
    mm = Math.round((h - hh) * 60);
  return `${dateKey}T${String(hh).padStart(2, "0")}:${String(Math.min(59, mm)).padStart(2, "0")}`;
};

/* ---------------- daily weather generator ---------------- */
type DayState = {
  tmax: number;
  tmin: number;
  rain: number;
  convective: boolean;
  dew: number;
  cloud: number;
};

function daySeedParams(
  lat: number,
  lon: number,
  n: Normals,
  dateKey: string,
  region: Region,
): DayState {
  const doy = dayOfYear(dateKey);
  const t = Math.floor(new Date(dateKey + "T00:00:00Z").getTime() / 86400000);
  const loc = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const ph = rng(loc + "phase");
  const p1 = ph() * 6.28,
    p2 = ph() * 6.28;
  const anomaly =
    1.5 * Math.sin((2 * Math.PI * t) / 7.3 + p1) + 0.8 * Math.sin((2 * Math.PI * t) / 3.1 + p2);
  const r = rng(loc + dateKey);
  const mP = monthlyAt(n.precip, doy);
  const month = Math.min(11, Math.floor((doy - 1) / 30.5));
  const daily = mP / DAYS_IN_MONTH[month];
  const prob = clamp(1 - Math.exp(-daily / 4.5), 0.02, 0.85);
  const wet = r() < prob;
  const m1 = daily / prob / 1.45; // mixed-exponential: 15% of wet days come from a 4× heavier tail
  const rain = wet
    ? round(Math.min(-Math.log(Math.max(1e-4, r())) * (r() < 0.15 ? m1 * 4 : m1), 320), 1)
    : 0;
  const convective =
    wet && ((month >= 3 && month <= 9) || region === "tamilnadu" || region === "northeast");
  const cool = wet ? clamp(rain * 0.12, 0.5, 5) : 0;
  const tmax = monthlyAt(n.tmax, doy) + anomaly - cool + gauss(r) * 0.6;
  const tmin = monthlyAt(n.tmin, doy) + anomaly * 0.7 + (wet ? 0.5 : 0) + gauss(r) * 0.5;
  const rh = monthlyAt(n.rh, doy) + (wet ? 10 : 0);
  const tm = (tmax + tmin) / 2;
  const dew = dewFrom(tm, clamp(rh, 10, 99));
  const cloud = wet ? clamp(70 + r() * 30, 0, 100) : clamp(mP / 4 + r() * 35, 0, 95);
  return { tmax, tmin: Math.min(tmin, tmax - 2), rain, convective, dew, cloud };
}

export function dewFrom(t: number, rh: number) {
  const a = 17.625,
    b = 243.04;
  const g = Math.log(rh / 100) + (a * t) / (b + t);
  return (b * g) / (a - g);
}
export function rhFrom(t: number, dew: number) {
  const a = 17.625,
    b = 243.04;
  return clamp(100 * Math.exp((a * dew) / (b + dew) - (a * t) / (b + t)), 1, 100);
}
function diurnal(h: number) {
  if (h >= 6 && h <= 15) return 0.5 - 0.5 * Math.cos((Math.PI * (h - 6)) / 9);
  const x = h > 15 ? h : h + 24;
  return Math.pow((30 - x) / 15, 1.6);
}

export function syntheticHourly(
  time: string[],
  lat: number,
  lon: number,
  elev: number,
  n: Normals,
): HourlyData {
  const region = regionOf(lat, lon);
  const H: HourlyData = {
    time,
    temp: [],
    rh: [],
    dew: [],
    feels: [],
    precip: [],
    precipProb: [],
    code: [],
    cloud: [],
    wind: [],
    windDir: [],
    gust: [],
    pressure: [],
    visibility: [],
    uv: [],
    cape: [],
    li: [],
    cin: [],
    freezing: [],
    wind925: [],
    dir925: [],
    wind500: [],
    dir500: [],
    isDay: [],
    snow: [],
    soilMoist: [],
  };
  const cache = new Map<string, DayState>();
  const loc = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  for (const key of time) {
    const dk = key.slice(0, 10),
      h = hourOf(key);
    if (!cache.has(dk)) cache.set(dk, daySeedParams(lat, lon, n, dk, region));
    const d = cache.get(dk)!;
    const r = rng(loc + key);
    const doy = dayOfYear(dk);
    const month = new Date(dk + "T00:00:00Z").getUTCMonth();
    const sh = diurnal(h);
    const temp = d.tmin + (d.tmax - d.tmin) * sh + gauss(r) * 0.25;
    const dew = Math.min(temp - 0.3, d.dew + gauss(r) * 0.4 - (sh - 0.5) * 1.2);
    const rh = rhFrom(temp, dew);
    // rain distribution
    let precip = 0;
    if (d.rain > 0) {
      const w = d.convective ? Math.exp(-((h - 17) ** 2) / 8) : 0.6 + 0.4 * r();
      const norm = d.convective ? 5.0 : 19.2;
      precip = round((d.rain * w) / norm, 1);
    }
    const season =
      month >= 2 && month <= 9 ? 1 : region === "tamilnadu" || region === "northeast" ? 0.8 : 0.35;
    let cape = Math.max(0, (dew - 13) * 210) * season * (0.25 + 0.75 * sh);
    if (d.convective) cape *= h <= 17 ? 1.45 : 0.6;
    cape = round(clamp(cape + gauss(r) * 80, 0, 5500), 0);
    const li = round(clamp(2.5 - cape / 420 + gauss(r) * 0.4, -12, 12));
    const cin = round(clamp(25 + 140 * (1 - sh) + gauss(r) * 10, 0, 400), 0);
    const cloud = round(
      clamp(
        d.cloud + (d.convective ? 25 * Math.exp(-((h - 17) ** 2) / 10) - 10 : 0) + gauss(r) * 6,
        0,
        100,
      ),
      0,
    );
    const baseWind = monthlyAt(n.wind, doy);
    const wind = round(clamp(baseWind * (0.55 + 0.7 * sh) + gauss(r) * 1.5, 0, 120));
    const gust = round(
      wind * 1.55 + (precip > 1 && d.convective ? 18 + cape / 90 : 0) + Math.abs(gauss(r)) * 3,
    );
    let dir =
      month >= 5 && month <= 8 ? 235 : month >= 10 || month <= 1 ? (lat < 16 ? 50 : 300) : 270;
    if (region === "northeast") dir = month >= 3 && month <= 8 ? 200 : 60;
    dir = (dir + gauss(r) * 25 + 360) % 360;
    const winterJet = month >= 10 || month <= 3;
    const w500ms = winterJet
      ? clamp(12 + (lat - 18) * 1.4, 6, 45)
      : month >= 5 && month <= 8
        ? 9
        : 11;
    const dir500 = winterJet || month <= 4 ? 270 : 95;
    const fogSeason =
      (month >= 10 || month <= 1) && (region === "gangetic" || region === "northwest-plains");
    const foggy = fogSeason && h >= 2 && h <= 9 && rh > 90;
    let visibility = 24000 - precip * 2500 - (fogSeason ? 12000 : 0);
    if (foggy) visibility = 150 + r() * 700;
    visibility = round(clamp(visibility, 50, 50000), 0);
    const elevSun = solarElevation(lat, lon, dk, h + 0.5);
    const isDay = elevSun > -0.833 ? 1 : 0;
    const uv = round(
      Math.max(
        0,
        12.5 *
          Math.pow(Math.max(0, Math.sin((elevSun * Math.PI) / 180)), 2.4) *
          (1 - (0.6 * cloud) / 100) *
          (1 + elev / 9000),
      ),
    );
    let code = 0;
    if (precip > 0.05) {
      if (d.convective && cape > 2500 && precip > 4) code = 96;
      else if (d.convective && cape > 1100 && precip > 1.2) code = 95;
      else if (temp < 1) code = precip > 2 ? 75 : 71;
      else if (d.convective) code = precip > 6 ? 82 : precip > 2 ? 81 : 80;
      else code = precip > 7.6 ? 65 : precip > 2.5 ? 63 : 61;
    } else if (foggy) code = 45;
    else code = cloud > 85 ? 3 : cloud > 50 ? 2 : cloud > 20 ? 1 : 0;
    const feels = apparent(temp, rh, wind);
    const pressure = round(
      1012 -
        (month >= 5 && month <= 8 ? 7 : 0) +
        (month >= 11 || month <= 1 ? 4 : 0) +
        1.2 * Math.cos(((h - 10) * Math.PI) / 6) +
        gauss(r) * 0.6,
    );
    H.temp.push(round(temp));
    H.dew.push(round(dew));
    H.rh.push(round(rh, 0));
    H.feels.push(round(feels));
    H.precip.push(precip);
    H.precipProb.push(round(clamp(d.rain > 0 ? 55 + d.rain + r() * 15 : 5 + r() * 15, 0, 100), 0));
    H.code.push(code);
    H.cloud.push(cloud);
    H.wind.push(wind);
    H.windDir.push(round(dir, 0));
    H.gust.push(gust);
    H.pressure.push(pressure);
    H.visibility.push(visibility);
    H.uv.push(uv);
    H.cape.push(cape);
    H.li.push(li);
    H.cin.push(cin);
    H.freezing.push(round(Math.max(0, elev + temp / 0.0065), 0));
    H.wind925.push(round(wind * 1.5 + 4));
    H.dir925.push(round((dir + 15) % 360, 0));
    H.wind500.push(round(w500ms * 3.6 + gauss(r) * 4));
    H.dir500.push(round((dir500 + gauss(r) * 15 + 360) % 360, 0));
    H.isDay.push(isDay);
    H.snow.push(temp < 1 && precip > 0 ? round(precip * 0.7) : 0);
    H.soilMoist.push(
      round(
        clamp(
          0.1 + 0.3 * (1 - Math.exp(-monthlyAt(n.precip, doy) / 150)) + (d.rain > 0 ? 0.04 : 0),
          0.03,
          0.5,
        ),
        3,
      ),
    );
  }
  return H;
}

/** Steadman/Rothfusz-style apparent temperature (°C). */
export function apparent(t: number, rh: number, windKmh: number) {
  if (t >= 27 && rh >= 40) {
    const T = t * 1.8 + 32;
    const hi =
      -42.379 +
      2.04901523 * T +
      10.14333127 * rh -
      0.22475541 * T * rh -
      0.00683783 * T * T -
      0.05481717 * rh * rh +
      0.00122874 * T * T * rh +
      0.00085282 * T * rh * rh -
      0.00000199 * T * T * rh * rh;
    return (hi - 32) / 1.8;
  }
  if (t <= 10 && windKmh > 4.8) {
    const v = Math.pow(windKmh, 0.16);
    return 13.12 + 0.6215 * t - 11.37 * v + 0.3965 * t * v;
  }
  return t;
}

/** Aggregate hourly data to the daily table. */
export function dailyFromHourly(H: HourlyData, lat: number, lon: number, n: Normals): DailyData {
  const days = Array.from(new Set(H.time.map((t) => t.slice(0, 10))));
  const D: DailyData = {
    time: days,
    tmax: [],
    tmin: [],
    precip: [],
    precipProb: [],
    code: [],
    windMax: [],
    gustMax: [],
    uvMax: [],
    et0: [],
    snow: [],
    sunrise: [],
    sunset: [],
  };
  for (const dk of days) {
    const idx = H.time.map((t, i) => (t.startsWith(dk) ? i : -1)).filter((i) => i >= 0);
    const pick = (a: number[]) => idx.map((i) => a[i]);
    const tx = Math.max(...pick(H.temp)),
      tn = Math.min(...pick(H.temp));
    D.tmax.push(round(tx));
    D.tmin.push(round(tn));
    D.precip.push(round(pick(H.precip).reduce((a, b) => a + b, 0)));
    D.precipProb.push(Math.max(...pick(H.precipProb)));
    D.code.push(dominantCode(pick(H.code)));
    D.windMax.push(Math.max(...pick(H.wind)));
    D.gustMax.push(Math.max(...pick(H.gust)));
    D.uvMax.push(Math.max(...pick(H.uv)));
    D.snow.push(round(pick(H.snow).reduce((a, b) => a + b, 0)));
    D.et0.push(round(hargreaves(tx, tn, lat, dk), 2));
    const s = sunTimes(lat, lon, dk);
    D.sunrise.push(hhmm(dk, s.rise));
    D.sunset.push(hhmm(dk, s.set));
  }
  void n;
  return D;
}
export function dominantCode(codes: number[]) {
  // severity-ordered: thunder > snow > rain > fog > cloud > clear
  return codes.reduce((a, b) => (codeRank(b) > codeRank(a) ? b : a), 0);
}
function codeRank(c: number) {
  if (c >= 95) return 100 + c;
  if (c >= 71 && c <= 77) return 80 + c / 10;
  if (c >= 51) return 60 + c / 10;
  if (c === 45 || c === 48) return 40;
  return c;
}
/** Hargreaves reference evapotranspiration (mm/day). */
export function hargreaves(tmax: number, tmin: number, lat: number, dateKey: string) {
  const doy = dayOfYear(dateKey),
    r = Math.PI / 180;
  const dr = 1 + 0.033 * Math.cos(((2 * Math.PI) / 365) * doy);
  const dec = 0.409 * Math.sin(((2 * Math.PI) / 365) * doy - 1.39);
  const ws = Math.acos(clamp(-Math.tan(lat * r) * Math.tan(dec), -1, 1));
  const Ra =
    ((24 * 60) / Math.PI) *
    0.082 *
    dr *
    (ws * Math.sin(lat * r) * Math.sin(dec) + Math.cos(lat * r) * Math.cos(dec) * Math.sin(ws));
  return Math.max(
    0,
    0.0023 * ((tmax + tmin) / 2 + 17.8) * Math.sqrt(Math.max(0, tmax - tmin)) * 0.408 * Ra,
  );
}

export function syntheticRecent(time: string[], lat: number, lon: number, n: Normals): RecentDaily {
  const region = regionOf(lat, lon);
  const R: RecentDaily = { time, tmax: [], tmin: [], precip: [] };
  for (const dk of time) {
    const d = daySeedParams(lat, lon, n, dk, region);
    R.tmax.push(round(d.tmax));
    R.tmin.push(round(d.tmin));
    R.precip.push(d.rain);
  }
  return R;
}

/* ---------------- long-term ---------------- */
function normCdf(z: number) {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}
function erf(x: number) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return x >= 0 ? y : -y;
}
function expectedHotDays(n: Normals, shift: number, thr = 40) {
  return n.tmax.reduce(
    (s, t, m) => s + DAYS_IN_MONTH[m] * (1 - normCdf((thr - t - shift) / 2.6)),
    0,
  );
}
function expectedColdNights(n: Normals, shift: number) {
  return n.tmin.reduce((s, t, m) => s + DAYS_IN_MONTH[m] * normCdf((10 - t - shift) / 2.2), 0);
}
function expectedHeavyDays(n: Normals) {
  return n.precip.reduce((s, p, m) => {
    const daily = p / DAYS_IN_MONTH[m];
    const prob = clamp(1 - Math.exp(-daily / 4.5), 0.02, 0.85);
    const m1 = Math.max(0.1, daily / prob / 1.45);
    return (
      s +
      DAYS_IN_MONTH[m] * prob * (0.85 * Math.exp(-64.5 / m1) + 0.15 * Math.exp(-64.5 / (4 * m1)))
    );
  }, 0);
}

export function syntheticHistory(
  lat: number,
  lon: number,
  n: Normals,
  fromYear: number,
  toYear: number,
): History {
  const loc = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const annT = n.tmean.reduce((a, b) => a + b, 0) / 12;
  const annTx = n.tmax.reduce((a, b) => a + b, 0) / 12;
  const annP = n.precip.reduce((a, b) => a + b, 0);
  const h: History = {
    years: [],
    tmean: [],
    tmaxMean: [],
    precip: [],
    hotDays: [],
    heavyRainDays: [],
    coldNights: [],
    maxTmax: [],
    maxDailyRain: [],
    pentadRain: [],
  };
  for (let y = fromYear; y <= toYear; y++) {
    const r = rng(loc + "yr" + y);
    const shift = 0.021 * (y - 2008) + gauss(r) * 0.32;
    const pf = clamp(1 + gauss(r) * 0.17, 0.5, 1.6);
    h.years.push(y);
    h.tmean.push(round(annT + shift, 2));
    h.tmaxMean.push(round(annTx + shift * 1.05, 2));
    h.precip.push(round(annP * pf, 0));
    h.hotDays.push(Math.max(0, Math.round(expectedHotDays(n, shift) * (0.8 + r() * 0.4))));
    h.coldNights.push(Math.max(0, Math.round(expectedColdNights(n, shift) * (0.85 + r() * 0.3))));
    h.heavyRainDays.push(Math.max(0, Math.round(expectedHeavyDays(n) * pf * (0.6 + r() * 0.8))));
    h.maxTmax.push(round(Math.max(...n.tmax) + 3 + shift + Math.abs(gauss(r))));
    const maxMonthDaily = Math.max(...n.precip.map((p, m) => p / DAYS_IN_MONTH[m]));
    h.maxDailyRain.push(round(maxMonthDaily * (4 + r() * 4) * pf, 0));
  }
  for (let p = 0; p < 73; p++) h.pentadRain.push(round(monthlyAt(n.precip, p * 5 + 3) / 30.44, 2));
  return h;
}

export function syntheticProjections(lat: number, lon: number, n: Normals): Projections {
  const loc = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const baseT = n.tmean.reduce((a, b) => a + b, 0) / 12 - 0.15; // 1995–2014 baseline
  const baseP = n.precip.reduce((a, b) => a + b, 0);
  const latFactor = lat > 24 ? 1.15 : lat < 15 ? 0.88 : 1;
  const p: Projections = {
    models: ["EC_Earth3P_HR (synthetic)", "MRI_AGCM3_2_S (synthetic)"],
    years: [],
    tmean: [],
    tmeanLo: [],
    tmeanHi: [],
    precip: [],
    precipLo: [],
    precipHi: [],
    hotDays: [],
    baselineTmean: round(baseT, 2),
    baselinePrecip: round(baseP, 0),
    baselineHotDays: Math.round(expectedHotDays(n, -0.15)),
  };
  for (let y = 2015; y <= 2050; y++) {
    const r = rng(loc + "proj" + y);
    const w = 0.027 * (y - 2005) * latFactor + gauss(r) * 0.18;
    const spread = 0.3 + 0.012 * (y - 2015);
    const pf = 1 + 0.002 * (y - 2005) + gauss(r) * 0.05;
    p.years.push(y);
    p.tmean.push(round(baseT + w, 2));
    p.tmeanLo.push(round(baseT + w - spread, 2));
    p.tmeanHi.push(round(baseT + w + spread, 2));
    p.precip.push(round(baseP * pf, 0));
    p.precipLo.push(round(baseP * (pf - 0.09), 0));
    p.precipHi.push(round(baseP * (pf + 0.09), 0));
    p.hotDays.push(Math.round(expectedHotDays(n, w)));
  }
  return p;
}

export function syntheticAir(time: string[], lat: number, lon: number): AirData {
  const region = regionOf(lat, lon);
  const loc = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const igp = region === "gangetic" || region === "northwest-plains";
  const out: AirData["hourly"] = { time, pm25: [], pm10: [], o3: [], no2: [] };
  for (const key of time) {
    const r = rng(loc + "aq" + key);
    const month = Number(key.slice(5, 7)) - 1,
      h = hourOf(key);
    const winter = month >= 9 || month <= 1;
    let base = igp
      ? winter
        ? 150
        : month >= 5 && month <= 8
          ? 30
          : 75
      : region === "thar"
        ? 60
        : region === "ladakh" || region === "islands"
          ? 12
          : region === "northeast" || region === "himalaya"
            ? 28
            : winter
              ? 55
              : 32;
    if (region === "thar" && month >= 3 && month <= 5) base += 40;
    const night = h >= 20 || h <= 8 ? 1.3 : 0.8;
    const pm25 = round(Math.max(3, base * night * (0.85 + r() * 0.3)), 0);
    out.pm25.push(pm25);
    out.pm10.push(round(pm25 * (region === "thar" ? 2.6 : 1.8), 0));
    out.o3.push(round(25 + 70 * diurnal(h) * (winter ? 0.7 : 1) + r() * 8, 0));
    out.no2.push(
      round(
        (igp ? 35 : 15) *
          ((h >= 7 && h <= 10) || (h >= 18 && h <= 22) ? 1.5 : 0.8) *
          (0.8 + r() * 0.4),
        0,
      ),
    );
  }
  const i = 0;
  return {
    hourly: out,
    current: {
      pm25: out.pm25[i],
      pm10: out.pm10[i],
      no2: out.no2[i],
      so2: igp ? 14 : 7,
      o3: out.o3[i],
      co: igp ? 1100 : 450,
      dust: region === "thar" ? 85 : igp ? 30 : 8,
      aod: igp ? 0.75 : 0.35,
      usAqi: usAqiPm25(out.pm25[i]),
    },
  };
}
export function usAqiPm25(c: number) {
  const bp: [number, number, number, number][] = [
    [0, 9, 0, 50],
    [9.1, 35.4, 51, 100],
    [35.5, 55.4, 101, 150],
    [55.5, 125.4, 151, 200],
    [125.5, 225.4, 201, 300],
    [225.5, 500, 301, 500],
  ];
  for (const [cl, ch, il, ih] of bp)
    if (c <= ch) return Math.round(((ih - il) / (ch - cl)) * (c - cl) + il);
  return 500;
}

export function syntheticFlood(
  time: string[],
  lat: number,
  lon: number,
  n: Normals,
  recentRain: number[],
): FloodData {
  const region = regionOf(lat, lon);
  const big = region === "gangetic" || region === "northeast";
  const annP = n.precip.reduce((a, b) => a + b, 0);
  const base = (big ? 2500 : region === "thar" || region === "ladakh" ? 8 : 180) * (annP / 1000);
  const loc = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const discharge: number[] = [];
  let store = recentRain.slice(-10).reduce((a, b) => a + b, 0);
  for (const dk of time) {
    const r = rng(loc + "q" + dk);
    const doy = dayOfYear(dk);
    const season = monthlyAt(n.precip, doy) / (annP / 12);
    store = store * 0.88 + (r() < 0.2 ? r() * 20 * season : 0);
    discharge.push(round(Math.max(0.1, base * (0.25 + 0.6 * season + store / 120)), 1));
  }
  return {
    time,
    discharge,
    p50: round(base * 0.6, 1),
    p90: round(base * 1.9, 1),
    p99: round(base * 3.2, 1),
  };
}

export function syntheticMarine(
  time: string[],
  lat: number,
  lon: number,
  coastKm: number,
): MarineData {
  const coastal = coastKm <= 40;
  const loc = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const region = regionOf(lat, lon);
  const waveMax: number[] = [],
    swellMax: number[] = [];
  for (const dk of time) {
    const r = rng(loc + "w" + dk);
    const m = Number(dk.slice(5, 7)) - 1;
    const monsoon = m >= 5 && m <= 8 ? (region === "westcoast" ? 1.8 : 1.0) : 0;
    const neMon = m >= 9 && m <= 11 && (region === "tamilnadu" || region === "eastcoast") ? 0.6 : 0;
    const w = coastal ? round(0.7 + monsoon + neMon + r() * 0.6, 1) : 0;
    waveMax.push(w);
    swellMax.push(round(w * 0.65, 1));
  }
  return { coastal, time, waveMax, swellMax };
}

export function recentAxis(today: string, days = 92) {
  return dailyAxis(addDays(today, -days), days);
}
