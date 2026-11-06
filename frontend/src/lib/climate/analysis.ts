/**
 * Derived climate characteristics, severe-weather diagnostics and IMD-style alerts.
 */
import type { ClimateProfile, HourlyData, Normals, Source } from "./types";
import { dayOfYear, fmtDay, istHourKey, monthlyAt, MONTHS } from "./time";

/* ---------------- weather codes ---------------- */
export const WMO: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Dense drizzle",
  56: "Freezing drizzle",
  57: "Freezing drizzle",
  61: "Light rain",
  63: "Moderate rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Rain showers",
  81: "Heavy showers",
  82: "Violent showers",
  85: "Snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Severe thunderstorm with hail",
};
export const describeCode = (c: number) => WMO[Math.round(c)] ?? "Cloudy";

/* ---------------- thermodynamics ---------------- */
export function wetBulb(t: number, rh: number) {
  // Stull (2011)
  return (
    t * Math.atan(0.151977 * Math.sqrt(rh + 8.313659)) +
    Math.atan(t + rh) -
    Math.atan(rh - 1.676331) +
    0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh) -
    4.686035
  );
}
export function heatIndex(t: number, rh: number) {
  if (t < 27) return t;
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
function uv(speedKmh: number, dirDeg: number) {
  const s = speedKmh / 3.6,
    r = (dirDeg * Math.PI) / 180;
  return [-s * Math.sin(r), -s * Math.cos(r)];
}
function shear(a: number, ad: number, b: number, bd: number) {
  const [u1, v1] = uv(a, ad),
    [u2, v2] = uv(b, bd);
  return Math.hypot(u2 - u1, v2 - v1); // m/s
}

/* ---------------- per-hour storm diagnostics ---------------- */
export type StormStage =
  | "Calm"
  | "Fair-weather cumulus"
  | "Towering cumulus"
  | "Thunderstorm"
  | "Severe thunderstorm"
  | "Tornadic supercell risk";
export const STAGE_ORDER: StormStage[] = [
  "Calm",
  "Fair-weather cumulus",
  "Towering cumulus",
  "Thunderstorm",
  "Severe thunderstorm",
  "Tornadic supercell risk",
];

export interface HourDiag {
  time: string;
  thunderProb: number; // %
  tornadoIndex: number; // STP-like, ≥1 notable
  shear06: number;
  shear01: number; // m/s
  lcl: number; // m
  hail: boolean;
  squall: boolean;
  fog: boolean;
  wetBulb: number;
  heatIndex: number;
  stage: StormStage;
  stormScore: number; // 0..100
}

export function diagnoseHour(H: HourlyData, i: number): HourDiag {
  const t = H.temp[i],
    td = H.dew[i],
    cape = Math.max(0, H.cape[i]),
    li = H.li[i],
    cin = Math.abs(H.cin[i]);
  const s06 = shear(H.wind[i], H.windDir[i], H.wind500[i], H.dir500[i]);
  const s01 = shear(H.wind[i], H.windDir[i], H.wind925[i], H.dir925[i]);
  const lcl = Math.max(0, 125 * (t - td));
  const code = H.code[i];
  const thunderCode = code >= 95;
  const x =
    -4.2 +
    cape / 650 +
    Math.max(0, -li) * 0.35 +
    H.precipProb[i] / 45 +
    (thunderCode ? 3.2 : 0) -
    cin / 150;
  const thunderProb = Math.round(100 / (1 + Math.exp(-x)));
  const lclTerm = lcl < 1000 ? 1 : lcl > 2000 ? 0 : (2000 - lcl) / 1000;
  const s6Term = s06 < 12.5 ? 0 : s06 > 30 ? 1.5 : s06 / 20;
  const cinTerm = cin > 200 ? 0 : cin < 50 ? 1 : (200 - cin) / 150;
  const tornadoIndex =
    Math.round((cape / 1500) * lclTerm * (s01 / 10) * s6Term * cinTerm * 100) / 100;
  const hail = code === 96 || code === 99 || (cape > 1800 && H.freezing[i] < 4600 && s06 > 12);
  const squall = H.gust[i] >= 60;
  const fog = H.visibility[i] < 1000 || code === 45 || code === 48;
  let stage: StormStage = "Calm";
  if (cape > 150 && H.cloud[i] > 15) stage = "Fair-weather cumulus";
  if (cape > 700 && thunderProb > 25) stage = "Towering cumulus";
  if (thunderProb >= 50 || thunderCode) stage = "Thunderstorm";
  if ((stage === "Thunderstorm" && (cape > 2000 || hail || H.gust[i] >= 70)) || code === 99)
    stage = "Severe thunderstorm";
  if (tornadoIndex >= 1 && thunderProb >= 40) stage = "Tornadic supercell risk";
  const stormScore = Math.min(
    100,
    Math.round(
      thunderProb * 0.6 + Math.min(40, tornadoIndex * 25) + (hail ? 10 : 0) + (squall ? 10 : 0),
    ),
  );
  return {
    time: H.time[i],
    thunderProb,
    tornadoIndex,
    shear06: Math.round(s06 * 10) / 10,
    shear01: Math.round(s01 * 10) / 10,
    lcl: Math.round(lcl),
    hail,
    squall,
    fog,
    wetBulb: Math.round(wetBulb(t, H.rh[i]) * 10) / 10,
    heatIndex: Math.round(heatIndex(t, H.rh[i]) * 10) / 10,
    stage,
    stormScore,
  };
}

export function nowIndex(H: HourlyData) {
  const k = istHourKey();
  const i = H.time.indexOf(k);
  return i >= 0 ? i : Math.min(H.time.length - 1, 24);
}

export function diagnoseRange(H: HourlyData, start: number, hours: number) {
  const out: HourDiag[] = [];
  for (let i = start; i < Math.min(H.time.length, start + hours); i++) out.push(diagnoseHour(H, i));
  return out;
}

/** Is a storm building up? Compares the next 6 h peak vs now. */
export function buildUp(diags: HourDiag[]) {
  if (!diags.length) return { building: false, peak: diags[0], hoursToPeak: 0, trend: 0 };
  const now = diags[0];
  const window = diags.slice(0, 12);
  const peak = window.reduce((a, b) => (b.stormScore > a.stormScore ? b : a), now);
  const hoursToPeak = window.indexOf(peak);
  const trend = peak.stormScore - now.stormScore;
  return { building: trend >= 15 && peak.stormScore >= 35, peak, hoursToPeak, trend };
}

/* ---------------- climate classification ---------------- */
export function koppen(n: Normals): { code: string; name: string } {
  const T = n.tmean,
    P = n.precip;
  const MAT = T.reduce((a, b) => a + b, 0) / 12,
    PA = P.reduce((a, b) => a + b, 0);
  const tmin = Math.min(...T),
    tmax = Math.max(...T);
  const summer = [3, 4, 5, 6, 7, 8],
    winter = [9, 10, 11, 0, 1, 2];
  const Ps = summer.reduce((s, m) => s + P[m], 0),
    Pw = PA - Ps;
  if (tmax < 10)
    return tmax < 0 ? { code: "EF", name: "Ice cap" } : { code: "ET", name: "Tundra / alpine" };
  const pth = 2 * MAT + (Ps >= 0.7 * PA ? 28 : Pw >= 0.7 * PA ? 0 : 14);
  if (PA < 10 * pth) {
    const w = PA < 5 * pth ? "W" : "S";
    const h = MAT >= 18 ? "h" : "k";
    return {
      code: `B${w}${h}`,
      name: `${w === "W" ? "Desert" : "Semi-arid steppe"} (${h === "h" ? "hot" : "cold"})`,
    };
  }
  if (tmin >= 18) {
    const dry = Math.min(...P);
    if (dry >= 60) return { code: "Af", name: "Tropical rainforest" };
    if (dry >= 100 - PA / 25) return { code: "Am", name: "Tropical monsoon" };
    const drySummer = Math.min(...summer.map((m) => P[m])) < Math.min(...winter.map((m) => P[m]));
    return drySummer
      ? { code: "As", name: "Tropical savanna (dry summer)" }
      : { code: "Aw", name: "Tropical savanna (dry winter)" };
  }
  const grp = tmin > 0 ? "C" : "D";
  const sMax = Math.max(...summer.map((m) => P[m])),
    sMin = Math.min(...summer.map((m) => P[m]));
  const wMax = Math.max(...winter.map((m) => P[m])),
    wMin = Math.min(...winter.map((m) => P[m]));
  const isW = wMin < sMax / 10,
    isS = sMin < 40 && sMin < wMax / 3;
  // when both qualify, the wetter half-year decides (monsoon India → w)
  const second = isW && (Ps >= Pw || !isS) ? "w" : isS ? "s" : "f";
  const months10 = T.filter((t) => t >= 10).length;
  const third = tmax >= 22 ? "a" : months10 >= 4 ? "b" : "c";
  const names: Record<string, string> = {
    Cwa: "Monsoon-influenced humid subtropical",
    Cwb: "Subtropical highland (dry winter)",
    Cfa: "Humid subtropical",
    Cfb: "Temperate oceanic",
    Csa: "Mediterranean (hot summer)",
    Csb: "Mediterranean (warm summer)",
    Dsb: "Continental (dry summer)",
    Dwb: "Continental (dry winter)",
    Dfb: "Humid continental",
    Dfc: "Subarctic",
    Dsc: "Subarctic (dry summer)",
    Cwc: "Subpolar oceanic (dry winter)",
  };
  const code = grp + second + third;
  return { code, name: names[code] ?? (grp === "C" ? "Temperate" : "Continental") };
}

/* ---------------- air quality (CPCB) ---------------- */
const BP_PM25: [number, number, number, number][] = [
  [0, 30, 0, 50],
  [31, 60, 51, 100],
  [61, 90, 101, 200],
  [91, 120, 201, 300],
  [121, 250, 301, 400],
  [251, 500, 401, 500],
];
const BP_PM10: [number, number, number, number][] = [
  [0, 50, 0, 50],
  [51, 100, 51, 100],
  [101, 250, 101, 200],
  [251, 350, 201, 300],
  [351, 430, 301, 400],
  [431, 1000, 401, 500],
];
function sub(c: number, bp: [number, number, number, number][]) {
  for (const [cl, ch, il, ih] of bp)
    if (c <= ch) return Math.round(il + ((ih - il) * (c - cl)) / Math.max(1, ch - cl));
  return 500;
}
export function cpcbAqi(pm25: number, pm10: number) {
  const v = Math.max(sub(pm25, BP_PM25), sub(pm10, BP_PM10));
  const cat =
    v <= 50
      ? "Good"
      : v <= 100
        ? "Satisfactory"
        : v <= 200
          ? "Moderate"
          : v <= 300
            ? "Poor"
            : v <= 400
              ? "Very Poor"
              : "Severe";
  return { value: v, category: cat };
}

/* ---------------- alerts ---------------- */
export type Level = "green" | "yellow" | "orange" | "red";
export const LEVEL_RANK: Record<Level, number> = { green: 0, yellow: 1, orange: 2, red: 3 };
export const LEVEL_LABEL: Record<Level, string> = {
  green: "No warning",
  yellow: "Be aware",
  orange: "Be prepared",
  red: "Take action",
};

export interface Alert {
  id: string;
  hazard: string;
  level: Level;
  title: string;
  when: string;
  detail: string;
  advice: string;
  simulated: boolean;
}

const regionHeatThreshold = (elev: number, coastKm: number) =>
  elev > 1000 ? 30 : coastKm < 30 ? 37 : 40;

export function computeAlerts(p: ClimateProfile): Alert[] {
  const A: Alert[] = [];
  const H = p.hourly,
    D = p.daily,
    n = p.normals,
    m = p.meta;
  const simH = p.sources.hourly === "synthetic",
    simD = p.sources.daily === "synthetic";
  const i0 = nowIndex(H);
  const diags = diagnoseRange(H, i0, 48);
  const todayIdx = Math.max(0, D.time.indexOf(H.time[i0].slice(0, 10)));
  const days = D.time.map((t, i) => ({ t, i })).slice(todayIdx, todayIdx + 5);

  // Thunderstorm / lightning / tornado / hail / squall
  const maxT = diags.reduce((a, b) => (b.thunderProb > a.thunderProb ? b : a), diags[0]);
  if (maxT && maxT.thunderProb >= 30) {
    const lvl: Level =
      maxT.thunderProb >= 75 ? "orange" : maxT.thunderProb >= 50 ? "yellow" : "yellow";
    A.push({
      id: "ts",
      hazard: "Thunderstorm & lightning",
      level: maxT.stage === "Severe thunderstorm" ? "red" : lvl,
      title: `${maxT.stage} likely (${maxT.thunderProb}%)`,
      when: whenOf(maxT.time),
      detail: `CAPE ${Math.round(H.cape[H.time.indexOf(maxT.time)])} J/kg, deep-layer shear ${maxT.shear06} m/s.`,
      advice:
        "Stay indoors when thunder roars; avoid open fields, trees and water bodies. Unplug appliances.",
      simulated: simH,
    });
  }
  const maxTor = diags.reduce((a, b) => (b.tornadoIndex > a.tornadoIndex ? b : a), diags[0]);
  if (maxTor && maxTor.tornadoIndex >= 0.5) {
    A.push({
      id: "tor",
      hazard: "Tornado / funnel cloud",
      level: maxTor.tornadoIndex >= 2 ? "red" : maxTor.tornadoIndex >= 1 ? "orange" : "yellow",
      title: `Tornado potential index ${maxTor.tornadoIndex}`,
      when: whenOf(maxTor.time),
      detail: `Low cloud base (LCL ${maxTor.lcl} m) with 0–1 km shear ${maxTor.shear01} m/s and 0–6 km shear ${maxTor.shear06} m/s — rotating storms possible.`,
      advice:
        "Identify a sturdy interior room. Watch for a lowering, rotating cloud base or a roaring sound.",
      simulated: simH,
    });
  }
  const hailH = diags.find((d) => d.hail);
  if (hailH)
    A.push({
      id: "hail",
      hazard: "Hailstorm",
      level: "orange",
      title: "Hail possible",
      when: whenOf(hailH.time),
      detail: `Strong updrafts with a freezing level near ${Math.round(H.freezing[H.time.indexOf(hailH.time)])} m.`,
      advice: "Protect vehicles, livestock and standing crops; stay under solid cover.",
      simulated: simH,
    });
  const maxG = Math.max(...diags.map((_, k) => H.gust[i0 + k]));
  if (maxG >= 50) {
    const k = diags.findIndex((_, j) => H.gust[i0 + j] === maxG);
    A.push({
      id: "wind",
      hazard: "Squall / strong wind",
      level: maxG >= 100 ? "red" : maxG >= 75 ? "orange" : "yellow",
      title: `Gusts up to ${Math.round(maxG)} km/h`,
      when: whenOf(H.time[i0 + k]),
      detail:
        maxG >= 88
          ? "Gale-force gusts can uproot trees and damage kutcha houses."
          : "Gusty winds may break branches and disrupt power lines.",
      advice: "Secure loose objects and tin roofs; avoid parking under trees or hoardings.",
      simulated: simH,
    });
  }

  // Cyclonic conditions: very low pressure + strong winds near the coast
  const minP = Math.min(...diags.map((_, k) => H.pressure[i0 + k]));
  if (minP < 1000 && maxG > 60 && m.coastKm < 150)
    A.push({
      id: "cyc",
      hazard: "Cyclonic storm",
      level: minP < 990 ? "red" : "orange",
      title: `Cyclonic circulation — pressure ${Math.round(minP)} hPa`,
      when: "Next 48 h",
      detail: "A deep low with gale-force winds near the coast.",
      advice:
        "Follow IMD/NDMA bulletins; fishermen should not venture out; be ready to move to cyclone shelters.",
      simulated: simH,
    });

  // Rainfall (IMD daily categories)
  for (const { t, i } of days) {
    const r = D.precip[i];
    if (r >= 64.5) {
      const lvl: Level = r >= 204.5 ? "red" : r >= 115.6 ? "orange" : "yellow";
      const cat = r >= 204.5 ? "Extremely heavy" : r >= 115.6 ? "Very heavy" : "Heavy";
      A.push({
        id: "rain" + t,
        hazard: "Heavy rainfall",
        level: lvl,
        title: `${cat} rain — ${Math.round(r)} mm`,
        when: fmtDay(t),
        detail: "Waterlogging, flash floods and landslides (in hills) possible.",
        advice: "Avoid low-lying roads and underpasses; do not cross flowing water.",
        simulated: simD,
      });
      break;
    }
  }

  // Heat wave / cold wave (IMD criteria with departures from normal)
  const heatThr = regionHeatThreshold(m.elevation, m.coastKm);
  for (const { t, i } of days) {
    const tx = D.tmax[i],
      normal = monthlyAt(n.tmax, dayOfYear(t)),
      dep = tx - normal;
    if (tx >= heatThr && (dep >= 4.5 || tx >= 45)) {
      const severe = dep >= 6.5 || tx >= 47;
      A.push({
        id: "heat",
        hazard: "Heat wave",
        level: severe ? "red" : "orange",
        title: `${severe ? "Severe heat wave" : "Heat wave"} — ${Math.round(tx)}°C (${dep >= 0 ? "+" : ""}${dep.toFixed(1)}°C vs normal)`,
        when: fmtDay(t),
        detail: `IMD criterion: ≥${heatThr}°C and ≥4.5°C above normal.`,
        advice:
          "Drink water often, avoid sun 12–4 pm, check on elderly people and outdoor workers.",
        simulated: simD,
      });
      break;
    }
    if (tx >= heatThr - 2 && dep >= 3) {
      A.push({
        id: "heat",
        hazard: "Hot day",
        level: "yellow",
        title: `Hot day — ${Math.round(tx)}°C`,
        when: fmtDay(t),
        detail: `${dep.toFixed(1)}°C above normal.`,
        advice: "Stay hydrated and limit afternoon exertion.",
        simulated: simD,
      });
      break;
    }
  }
  for (const { t, i } of days) {
    const tn = D.tmin[i],
      normal = monthlyAt(n.tmin, dayOfYear(t)),
      dep = tn - normal;
    // IMD: departure-based everywhere; absolute ≤4 °C only counts on the plains, and still needs a real anomaly
    const plains = m.elevation < 1000;
    if ((tn <= (plains ? 10 : 0) && dep <= -4.5) || (plains && tn <= 4 && dep <= -2)) {
      const severe = dep <= -6.5 || (plains && tn <= 2);
      A.push({
        id: "cold",
        hazard: "Cold wave",
        level: severe ? "orange" : "yellow",
        title: `${severe ? "Severe cold wave" : "Cold wave"} — min ${Math.round(tn)}°C`,
        when: fmtDay(t),
        detail: `${dep.toFixed(1)}°C vs normal minimum.`,
        advice: "Keep warm in layers; never use coal stoves in closed rooms.",
        simulated: simD,
      });
      break;
    }
  }

  // Humid heat (wet-bulb)
  const maxWb = Math.max(...diags.map((d) => d.wetBulb));
  if (maxWb >= 28)
    A.push({
      id: "wb",
      hazard: "Humid heat stress",
      level: maxWb >= 32 ? "red" : maxWb >= 30 ? "orange" : "yellow",
      title: `Wet-bulb temperature ${maxWb.toFixed(1)}°C`,
      when: "Next 48 h",
      detail: "Sweat cools the body poorly at this humidity; heat-stroke risk rises sharply.",
      advice: "Rest in shade, use fans with water mist, and take breaks from physical work.",
      simulated: simH,
    });

  // Fog
  const fogH = diags.find((d) => d.fog);
  if (fogH) {
    const vis = H.visibility[H.time.indexOf(fogH.time)];
    A.push({
      id: "fog",
      hazard: "Fog / low visibility",
      level: vis < 50 ? "red" : vis < 200 ? "orange" : "yellow",
      title: `Visibility down to ${Math.round(vis)} m`,
      when: whenOf(fogH.time),
      detail: vis < 200 ? "Dense fog — road, rail and flight delays likely." : "Moderate fog.",
      advice: "Drive slowly with low-beam lights; allow extra travel time.",
      simulated: simH,
    });
  }

  // UV
  const uvMax = D.uvMax[todayIdx];
  if (uvMax >= 8)
    A.push({
      id: "uv",
      hazard: "UV radiation",
      level: uvMax >= 11 ? "orange" : "yellow",
      title: `UV index ${Math.round(uvMax)} (${uvMax >= 11 ? "extreme" : "very high"})`,
      when: fmtDay(D.time[todayIdx]),
      detail: "Skin damage can occur in under 15 minutes around noon.",
      advice: "Wear a hat and sunglasses; use sunscreen; seek shade at midday.",
      simulated: simD,
    });

  // Air quality
  const aq = cpcbAqi(p.air.current.pm25, p.air.current.pm10);
  if (aq.value > 200)
    A.push({
      id: "aqi",
      hazard: "Air pollution",
      level: aq.value > 400 ? "red" : aq.value > 300 ? "orange" : "yellow",
      title: `AQI ${aq.value} — ${aq.category}`,
      when: "Now",
      detail: `PM2.5 ${Math.round(p.air.current.pm25)} µg/m³, PM10 ${Math.round(p.air.current.pm10)} µg/m³.`,
      advice: "Limit outdoor exercise; use N95 masks; keep windows closed during peak hours.",
      simulated: p.sources.air === "synthetic",
    });

  // Flood
  const F = p.flood;
  const fi = F.time.indexOf(H.time[i0].slice(0, 10));
  const future = F.discharge.slice(Math.max(0, fi));
  const peakQ = Math.max(...future);
  if (peakQ > F.p90 && F.p90 > 1) {
    const day = F.time[Math.max(0, fi) + future.indexOf(peakQ)];
    A.push({
      id: "flood",
      hazard: "River flood",
      level: peakQ > F.p99 ? "red" : peakQ > (F.p90 + F.p99) / 2 ? "orange" : "yellow",
      title: `River discharge ${Math.round(peakQ)} m³/s`,
      when: fmtDay(day),
      detail: `Above the 90th percentile (${Math.round(F.p90)} m³/s)${peakQ > F.p99 ? " and the 1-in-100-day level" : ""}.`,
      advice:
        "Move valuables and livestock to higher ground; follow district administration advisories.",
      simulated: p.sources.flood === "synthetic",
    });
  }

  // Drought (90-day standardised precipitation)
  const spi = droughtIndex(p);
  if (spi.z <= -1 && spi.normal > 20)
    A.push({
      id: "drought",
      hazard: "Meteorological drought",
      level: spi.z <= -2 ? "orange" : "yellow",
      title: `${spi.category} — ${spi.pct}% of normal rain (90 days)`,
      when: "Past 90 days",
      detail: `${Math.round(spi.observed)} mm vs ${Math.round(spi.normal)} mm normal.`,
      advice: "Plan irrigation; consider short-duration, drought-tolerant crops.",
      simulated: p.sources.recent === "synthetic",
    });

  // Fire weather: hot, dry, windy, no rain
  const fwi = fireWeather(p, i0);
  if (fwi.level !== "green")
    A.push({
      id: "fire",
      hazard: "Forest / crop fire weather",
      level: fwi.level,
      title: fwi.title,
      when: "Today",
      detail: fwi.detail,
      advice:
        "Avoid burning crop residue or waste; report forest fires to 1926 / local forest office.",
      simulated: simH,
    });

  // Sea state
  if (p.marine.coastal) {
    const w = Math.max(...p.marine.waveMax.slice(0, 3));
    if (w >= 2.5)
      A.push({
        id: "sea",
        hazard: "Rough sea",
        level: w >= 4 ? "red" : w >= 3 ? "orange" : "yellow",
        title: `Waves up to ${w.toFixed(1)} m`,
        when: "Next 3 days",
        detail: "Rough to very rough sea conditions.",
        advice: "Fishermen are advised not to venture out; avoid beaches.",
        simulated: p.sources.marine === "synthetic",
      });
  }

  // Snow
  // physical consistency: ignore reported snow on days too warm for it
  const snow = days.reduce((s, { i }) => s + (D.tmin[i] <= 3 ? D.snow[i] : 0), 0);
  if (snow >= 5)
    A.push({
      id: "snow",
      hazard: "Snowfall",
      level: snow >= 30 ? "orange" : "yellow",
      title: `${Math.round(snow)} cm snow over 5 days`,
      when: "Next 5 days",
      detail: "Roads and passes may close; avalanche risk on steep slopes.",
      advice: "Check road status before travel; carry chains and warm clothing.",
      simulated: simD,
    });

  return A.sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level]);
}

function whenOf(t: string) {
  const now = istHourKey();
  const dh = Math.round((Date.parse(t + ":00Z") - Date.parse(now + ":00Z")) / 3600000);
  if (dh <= 0) return "Now";
  return `In ${dh} h · ${fmtDay(t)} ${t.slice(11, 16)}`;
}

export function droughtIndex(p: ClimateProfile) {
  const R = p.recent;
  const observed = R.precip.slice(-90).reduce((a, b) => a + b, 0);
  const normal = R.time
    .slice(-90)
    .reduce((s, d) => s + monthlyAt(p.normals.precip, dayOfYear(d)) / 30.44, 0);
  const cv = normal > 300 ? 0.3 : normal > 100 ? 0.45 : 0.7;
  const z = normal > 1 ? (observed - normal) / (normal * cv) : 0;
  const category =
    z <= -2
      ? "Extreme drought"
      : z <= -1.5
        ? "Severe drought"
        : z <= -1
          ? "Moderate drought"
          : z >= 2
            ? "Extremely wet"
            : z >= 1.5
              ? "Very wet"
              : z >= 1
                ? "Moderately wet"
                : "Near normal";
  return {
    observed,
    normal,
    z: Math.round(z * 100) / 100,
    pct: normal > 0 ? Math.round((observed / normal) * 100) : 100,
    category,
  };
}

function fireWeather(
  p: ClimateProfile,
  i0: number,
): { level: Level; title: string; detail: string } {
  const H = p.hourly;
  const day = H.time.slice(i0, i0 + 24).map((_, k) => i0 + k);
  const minRh = Math.min(...day.map((i) => H.rh[i])),
    maxT = Math.max(...day.map((i) => H.temp[i])),
    maxW = Math.max(...day.map((i) => H.wind[i]));
  const rain7 = p.recent.precip.slice(-7).reduce((a, b) => a + b, 0);
  const score =
    (maxT > 30 ? (maxT - 30) * 3 : 0) +
    (minRh < 40 ? (40 - minRh) * 1.5 : 0) +
    (maxW > 15 ? maxW - 15 : 0) +
    (rain7 < 2 ? 15 : 0);
  const level: Level =
    score >= 75 ? "red" : score >= 55 ? "orange" : score >= 38 ? "yellow" : "green";
  return {
    level,
    title: `Fire danger score ${Math.round(score)}`,
    detail: `Max ${Math.round(maxT)}°C, min humidity ${Math.round(minRh)}%, wind ${Math.round(maxW)} km/h, ${rain7.toFixed(1)} mm rain in 7 days.`,
  };
}

/* ---------------- climate characteristics ---------------- */
export interface Characteristic {
  label: string;
  value: string;
  note?: string;
  src: Source;
}
export interface CharGroup {
  title: string;
  items: Characteristic[];
}

function slope(xs: number[], ys: number[]) {
  const n = xs.length;
  if (n < 3) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n,
    my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0,
    den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den ? num / den : 0;
}
const f1 = (x: number) => (Math.round(x * 10) / 10).toFixed(1);
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const avg = (a: number[]) => (a.length ? sum(a) / a.length : 0);

export function monsoonTiming(pentads: number[]) {
  const annualDaily = avg(pentads);
  const thr = Math.max(annualDaily * 1.6, 3);
  let onset = -1,
    withdraw = -1;
  for (let i = 18; i < 45; i++)
    if (pentads[i] >= thr && pentads[i + 1] >= thr) {
      onset = i;
      break;
    }
  if (onset >= 0)
    for (let i = 72; i > onset; i--)
      if (pentads[i] >= thr) {
        withdraw = i;
        break;
      }
  const toDate = (pent: number) => {
    const d = new Date(Date.UTC(2001, 0, 1 + pent * 5 + 2));
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
  };
  return {
    onset: onset >= 0 ? toDate(onset) : "No distinct monsoon onset",
    withdrawal: withdraw >= 0 ? toDate(withdraw) : "—",
    lengthDays: onset >= 0 && withdraw >= 0 ? (withdraw - onset) * 5 : 0,
  };
}

export function characteristics(p: ClimateProfile): CharGroup[] {
  const n = p.normals,
    H = p.history,
    m = p.meta,
    S = p.sources,
    D = p.daily,
    P = p.projections;
  const k = koppen(n);
  const annT = avg(n.tmean),
    annP = sum(n.precip);
  const hot = n.tmax.indexOf(Math.max(...n.tmax)),
    cold = n.tmin.indexOf(Math.min(...n.tmin));
  const wet = n.precip.indexOf(Math.max(...n.precip)),
    dry = n.precip.indexOf(Math.min(...n.precip));
  const jjas = n.precip[5] + n.precip[6] + n.precip[7] + n.precip[8],
    ond = n.precip[9] + n.precip[10] + n.precip[11];
  const pet = sum(
    n.tmax.map(
      (tx, i) =>
        0.0023 *
        ((tx + n.tmin[i]) / 2 + 17.8) *
        Math.sqrt(Math.max(0, tx - n.tmin[i])) *
        0.408 *
        extraterrestrial(m.lat, i) *
        [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][i],
    ),
  );
  const ai = annP / Math.max(1, pet);
  const aiClass =
    ai < 0.05
      ? "Hyper-arid"
      : ai < 0.2
        ? "Arid"
        : ai < 0.5
          ? "Semi-arid"
          : ai < 0.65
            ? "Dry sub-humid"
            : "Humid";
  const tTrend = slope(H.years, H.tmean) * 10,
    pTrend = ((slope(H.years, H.precip) * 10) / Math.max(1, avg(H.precip))) * 100;
  const hotTrend = slope(H.years, H.hotDays) * 10,
    heavyTrend = slope(H.years, H.heavyRainDays) * 10;
  const pcv =
    (Math.sqrt(avg(H.precip.map((x) => (x - avg(H.precip)) ** 2))) / Math.max(1, avg(H.precip))) *
    100;
  const mt = monsoonTiming(H.pentadRain);
  const recordT = Math.max(...H.maxTmax),
    recordTy = H.years[H.maxTmax.indexOf(recordT)];
  const recordR = Math.max(...H.maxDailyRain),
    recordRy = H.years[H.maxDailyRain.indexOf(recordR)];
  const gdd = sum(
    n.tmean.map(
      (t, i) => Math.max(0, t - 10) * [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][i],
    ),
  );
  const iNow = nowIndex(p.hourly),
    h = p.hourly;
  const p2050 = P.tmean[P.tmean.length - 1] - P.baselineTmean;
  const p2030i = P.years.indexOf(2030);
  const aq = cpcbAqi(p.air.current.pm25, p.air.current.pm10);
  const spi = droughtIndex(p);
  const growMonths = n.precip
    .map((pr, i) => pr > 0.5 * (pet / 12) && n.tmean[i] > 5)
    .filter(Boolean).length;
  const dominant = hazardProfile(p);

  return [
    {
      title: "Location & terrain",
      items: [
        {
          label: "Place",
          value: [m.name, m.district, m.state]
            .filter(Boolean)
            .filter((v, i, a) => a.indexOf(v) === i)
            .join(", "),
          src: S.meta,
        },
        {
          label: "Coordinates",
          value: `${m.lat.toFixed(3)}°N, ${m.lon.toFixed(3)}°E`,
          src: "live",
        },
        {
          label: "Elevation",
          value: `${m.elevation} m`,
          note:
            m.elevation > 2500
              ? "High mountain"
              : m.elevation > 1000
                ? "Hill / highland"
                : m.elevation > 300
                  ? "Plateau / upland"
                  : "Plain / lowland",
          src: S.meta,
        },
        { label: "Physiographic region", value: m.region, src: "live" },
        {
          label: "Distance to coast",
          value: `${m.coastKm} km`,
          note:
            m.coastKm < 50
              ? "Maritime influence"
              : m.coastKm > 400
                ? "Strongly continental"
                : "Moderately continental",
          src: "live",
        },
        { label: "Nearest reference city", value: m.nearest, src: "live" },
      ],
    },
    {
      title: "Climate type",
      items: [
        { label: "Köppen–Geiger class", value: `${k.code} — ${k.name}`, src: S.normals },
        { label: "Aridity index (P/PET)", value: `${ai.toFixed(2)} — ${aiClass}`, src: S.normals },
        { label: "Annual mean temperature", value: `${f1(annT)} °C`, src: S.normals },
        { label: "Annual rainfall", value: `${Math.round(annP)} mm`, src: S.normals },
        {
          label: "Annual reference ET₀",
          value: `${Math.round(pet)} mm`,
          note:
            annP < pet
              ? `Water deficit ${Math.round(pet - annP)} mm`
              : `Water surplus ${Math.round(annP - pet)} mm`,
          src: S.normals,
        },
      ],
    },
    {
      title: "Temperature",
      items: [
        {
          label: "Hottest month",
          value: `${MONTHS[hot]} — avg max ${f1(n.tmax[hot])} °C`,
          src: S.normals,
        },
        {
          label: "Coldest month",
          value: `${MONTHS[cold]} — avg min ${f1(n.tmin[cold])} °C`,
          src: S.normals,
        },
        {
          label: "Annual temperature range",
          value: `${f1(Math.max(...n.tmean) - Math.min(...n.tmean))} °C`,
          src: S.normals,
        },
        {
          label: "Mean diurnal range",
          value: `${f1(avg(n.tmax.map((x, i) => x - n.tmin[i])))} °C`,
          src: S.normals,
        },
        { label: "Days ≥ 40 °C per year", value: `${f1(avg(H.hotDays))}`, src: S.history },
        { label: "Nights ≤ 10 °C per year", value: `${f1(avg(H.coldNights))}`, src: S.history },
        {
          label: "Record high (since 1991)",
          value: `${f1(recordT)} °C (${recordTy})`,
          src: S.history,
        },
        { label: "Growing degree days (base 10 °C)", value: `${Math.round(gdd)}`, src: S.normals },
      ],
    },
    {
      title: "Rainfall & monsoon",
      items: [
        {
          label: "SW monsoon share (Jun–Sep)",
          value: `${Math.round((jjas / Math.max(1, annP)) * 100)}% (${Math.round(jjas)} mm)`,
          src: S.normals,
        },
        {
          label: "NE monsoon share (Oct–Dec)",
          value: `${Math.round((ond / Math.max(1, annP)) * 100)}% (${Math.round(ond)} mm)`,
          src: S.normals,
        },
        { label: "Typical monsoon onset", value: mt.onset, src: S.history },
        {
          label: "Typical monsoon withdrawal",
          value: mt.withdrawal,
          note: mt.lengthDays ? `~${mt.lengthDays}-day rainy season` : undefined,
          src: S.history,
        },
        {
          label: "Wettest / driest month",
          value: `${MONTHS[wet]} (${Math.round(n.precip[wet])} mm) / ${MONTHS[dry]} (${Math.round(n.precip[dry])} mm)`,
          src: S.normals,
        },
        {
          label: "Year-to-year rainfall variability",
          value: `${Math.round(pcv)}% CV`,
          note: pcv > 30 ? "Highly erratic" : pcv > 20 ? "Variable" : "Dependable",
          src: S.history,
        },
        {
          label: "Heavy-rain days (≥64.5 mm) / yr",
          value: f1(avg(H.heavyRainDays)),
          src: S.history,
        },
        {
          label: "Record 1-day rainfall (since 1991)",
          value: `${Math.round(recordR)} mm (${recordRy})`,
          src: S.history,
        },
        {
          label: "Last 90 days",
          value: `${spi.pct}% of normal — ${spi.category}`,
          note: `SPI-90 ≈ ${spi.z}`,
          src: S.recent,
        },
      ],
    },
    {
      title: "Humidity, wind & sun",
      items: [
        {
          label: "Mean relative humidity",
          value: `${Math.round(avg(n.rh))}% (range ${Math.round(Math.min(...n.rh))}–${Math.round(Math.max(...n.rh))}%)`,
          src: S.normals,
        },
        {
          label: "Mean wind speed",
          value: `${f1(avg(n.wind))} km/h`,
          note: `Windiest: ${MONTHS[n.wind.indexOf(Math.max(...n.wind))]}`,
          src: S.normals,
        },
        {
          label: "Solar resource",
          value: `${avg(n.solar).toFixed(2)} kWh/m²/day`,
          note:
            avg(n.solar) > 5.2
              ? "Excellent for solar power"
              : avg(n.solar) > 4.5
                ? "Good for solar"
                : "Moderate",
          src: S.normals,
        },
        {
          label: "Current wet-bulb temperature",
          value: `${f1(wetBulb(h.temp[iNow], h.rh[iNow]))} °C`,
          src: S.hourly,
        },
        {
          label: "Today's sunrise / sunset",
          value: `${D.sunrise[D.time.indexOf(h.time[iNow].slice(0, 10))]?.slice(11, 16) ?? "—"} / ${D.sunset[D.time.indexOf(h.time[iNow].slice(0, 10))]?.slice(11, 16) ?? "—"}`,
          src: S.daily,
        },
      ],
    },
    {
      title: "Long-term change",
      items: [
        {
          label: "Warming trend",
          value: `${tTrend >= 0 ? "+" : ""}${tTrend.toFixed(2)} °C per decade`,
          note: `${H.years[0]}–${H.years[H.years.length - 1]}`,
          src: S.history,
        },
        {
          label: "Rainfall trend",
          value: `${pTrend >= 0 ? "+" : ""}${pTrend.toFixed(1)}% per decade`,
          src: S.history,
        },
        {
          label: "Trend in ≥40 °C days",
          value: `${hotTrend >= 0 ? "+" : ""}${hotTrend.toFixed(1)} days per decade`,
          src: S.history,
        },
        {
          label: "Trend in heavy-rain days",
          value: `${heavyTrend >= 0 ? "+" : ""}${heavyTrend.toFixed(2)} days per decade`,
          src: S.history,
        },
        {
          label: "Projected warming by 2030",
          value: `${p2030i >= 0 ? `+${(P.tmean[p2030i] - P.baselineTmean).toFixed(1)}` : "—"} °C vs 1995–2014`,
          src: S.projections,
        },
        {
          label: "Projected warming by 2050",
          value: `+${p2050.toFixed(1)} °C (range ${(P.tmeanLo[P.tmeanLo.length - 1] - P.baselineTmean).toFixed(1)} to ${(P.tmeanHi[P.tmeanHi.length - 1] - P.baselineTmean).toFixed(1)})`,
          src: S.projections,
        },
        {
          label: "Projected rainfall change by 2050",
          value: `${(((P.precip[P.precip.length - 1] - P.baselinePrecip) / Math.max(1, P.baselinePrecip)) * 100).toFixed(0)}%`,
          src: S.projections,
        },
        {
          label: "Projected ≥40 °C days in 2050",
          value: `${P.hotDays[P.hotDays.length - 1]} (baseline ${P.baselineHotDays})`,
          src: S.projections,
        },
      ],
    },
    {
      title: "Hazards, air & water",
      items: [
        { label: "Dominant hazards", value: dominant.join(" · "), src: S.history },
        {
          label: "Air quality now (CPCB)",
          value: `AQI ${aq.value} — ${aq.category}`,
          note: `PM2.5 ${Math.round(p.air.current.pm25)} µg/m³`,
          src: S.air,
        },
        {
          label: "River discharge now",
          value: `${Math.round(p.flood.discharge[Math.max(0, p.flood.time.indexOf(h.time[iNow].slice(0, 10)))])} m³/s`,
          note: `Flood threshold (P90) ${Math.round(p.flood.p90)} m³/s`,
          src: S.flood,
        },
        {
          label: "Sea state",
          value: p.marine.coastal
            ? `Waves ${p.marine.waveMax[0].toFixed(1)} m today`
            : "Inland — not applicable",
          src: S.marine,
        },
        {
          label: "Surface soil moisture",
          value: `${h.soilMoist[iNow].toFixed(2)} m³/m³`,
          note: h.soilMoist[iNow] < 0.12 ? "Dry" : h.soilMoist[iNow] > 0.35 ? "Saturated" : "Moist",
          src: S.hourly,
        },
        {
          label: "Rain-fed growing months",
          value: `${growMonths} months`,
          note:
            growMonths >= 4
              ? "Kharif feasible without irrigation"
              : "Irrigation needed for most crops",
          src: S.normals,
        },
      ],
    },
  ];
}

function extraterrestrial(lat: number, month: number) {
  const doy = month * 30.44 + 15,
    r = Math.PI / 180;
  const dr = 1 + 0.033 * Math.cos(((2 * Math.PI) / 365) * doy);
  const dec = 0.409 * Math.sin(((2 * Math.PI) / 365) * doy - 1.39);
  const ws = Math.acos(Math.max(-1, Math.min(1, -Math.tan(lat * r) * Math.tan(dec))));
  return (
    ((24 * 60) / Math.PI) *
    0.082 *
    dr *
    (ws * Math.sin(lat * r) * Math.sin(dec) + Math.cos(lat * r) * Math.cos(dec) * Math.sin(ws))
  );
}

export function hazardProfile(p: ClimateProfile): string[] {
  const n = p.normals,
    H = p.history,
    m = p.meta;
  const out: [string, number][] = [];
  out.push(["Heat waves", avg(H.hotDays) * 2]);
  out.push(["Extreme rain / floods", avg(H.heavyRainDays) * 12 + (p.flood.p99 > 1000 ? 15 : 0)]);
  out.push(["Drought", Math.max(0, 40 - sum(n.precip) / 40) + (sum(n.precip) < 800 ? 20 : 0)]);
  out.push(["Cold waves & fog", avg(H.coldNights) * 0.6]);
  out.push([
    "Thunderstorms & lightning",
    Math.max(...n.tmax.slice(3, 6)) > 34 && Math.max(...n.rh.slice(3, 6)) > 45 ? 35 : 12,
  ]);
  if (m.coastKm < 60) out.push(["Cyclones & storm surge", m.lon > 79.5 ? 45 : 25]);
  if (m.elevation > 1000) out.push(["Landslides & cloudbursts", 30 + m.elevation / 200]);
  if (m.elevation > 2500) out.push(["Snow & avalanches", 40]);
  return out
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map((x) => x[0]);
}
