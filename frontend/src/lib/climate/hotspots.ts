/* eslint-disable @typescript-eslint/no-explicit-any -- parses untyped upstream API JSON */
/**
 * India-wide scan: one batched Open-Meteo request for ~80 reference cities,
 * fused with synthetic data per city, diagnosed for the next 12 hours.
 */
import { CITIES, coastDistanceKm, syntheticElevation, type City } from "./geo";
import { addDays, hourlyAxis, istDateKey, istHourKey } from "./time";
import { syntheticHourly, syntheticNormals, syntheticAir } from "./synthetic";
import { fuse, RANGES, type MergeStats, type Range } from "./clean";
import type { HourlyData, HourlyKey, Source } from "./types";
import { cpcbAqi, diagnoseHour, LEVEL_RANK, type HourDiag, type Level } from "./analysis";

export type HazardKind =
  | "tornado"
  | "thunder"
  | "hail"
  | "rain"
  | "wind"
  | "heat"
  | "cold"
  | "fog"
  | "smog"
  | "snow"
  | "calm";

export interface Hotspot {
  city: City;
  temp: number;
  feels: number;
  rh: number;
  wind: number;
  windDir: number;
  gust: number;
  precip: number;
  cloud: number;
  code: number;
  pm25: number;
  aqi: number;
  aqiCat: string;
  kind: HazardKind;
  level: Level;
  label: string;
  peak: HourDiag;
  building: boolean;
  hoursToPeak: number;
  source: Source;
}

const VARS: [HourlyKey, string, Range][] = [
  ["temp", "temperature_2m", RANGES.temp],
  ["rh", "relative_humidity_2m", RANGES.rh],
  ["dew", "dew_point_2m", RANGES.temp],
  ["feels", "apparent_temperature", RANGES.temp],
  ["precip", "precipitation", RANGES.precip],
  ["precipProb", "precipitation_probability", RANGES.prob],
  ["code", "weather_code", RANGES.code],
  ["cloud", "cloud_cover", RANGES.prob],
  ["wind", "wind_speed_10m", RANGES.wind],
  ["windDir", "wind_direction_10m", RANGES.dir],
  ["gust", "wind_gusts_10m", RANGES.wind],
  ["pressure", "pressure_msl", RANGES.pressure],
  ["visibility", "visibility", RANGES.visibility],
  ["cape", "cape", RANGES.cape],
  ["li", "lifted_index", RANGES.li],
  ["cin", "convective_inhibition", RANGES.cin],
  ["freezing", "freezing_level_height", RANGES.height],
  ["wind925", "wind_speed_925hPa", RANGES.wind],
  ["dir925", "wind_direction_925hPa", RANGES.dir],
  ["wind500", "wind_speed_500hPa", RANGES.wind],
  ["dir500", "wind_direction_500hPa", RANGES.dir],
  ["snow", "snowfall", RANGES.snow],
];

let cache: { t: number; v: Hotspot[] } | null = null;

export async function scanIndia(force = false): Promise<Hotspot[]> {
  if (!force && cache && Date.now() - cache.t < 15 * 60000) return cache.v;
  const lats = CITIES.map((c) => c.lat).join(","),
    lons = CITIES.map((c) => c.lon).join(",");
  const today = istDateKey();
  const axis = hourlyAxis(today, 2);
  let fc: any[] = [],
    aq: any[] = [];
  await Promise.all([
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&timezone=Asia%2FKolkata&forecast_days=2&hourly=${VARS.map((v) => v[1]).join(",")}`,
    )
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => {
        fc = Array.isArray(j) ? j : [j];
      })
      .catch(() => {}),
    fetch(
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lats}&longitude=${lons}&timezone=Asia%2FKolkata&current=pm2_5,pm10`,
    )
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => {
        aq = Array.isArray(j) ? j : [j];
      })
      .catch(() => {}),
  ]);
  const nowKey = istHourKey();
  const out = CITIES.map((city, ci) => {
    const elev = syntheticElevation(city.lat, city.lon);
    const n = syntheticNormals(city.lat, city.lon, elev, coastDistanceKm(city.lat, city.lon));
    const S = syntheticHourly(axis, city.lat, city.lon, elev, n);
    const live = fc[ci]?.hourly;
    const st: MergeStats = { live: 0, total: 0 };
    const H = { ...S } as HourlyData;
    for (const [k, name, range] of VARS)
      (H as any)[k] = fuse(axis, S[k], live?.time, live?.[name], range, st);
    H.dew = H.dew.map((d, i) => Math.min(d, H.temp[i]));
    const i0 = Math.max(0, axis.indexOf(nowKey));
    const diags: HourDiag[] = [];
    for (let i = i0; i < Math.min(axis.length, i0 + 12); i++) diags.push(diagnoseHour(H, i));
    const now = diags[0];
    const peak = diags.reduce((a, b) => (b.stormScore > a.stormScore ? b : a), now);
    const hoursToPeak = diags.indexOf(peak);
    const sa = syntheticAir([nowKey], city.lat, city.lon).current;
    const pmLive = Number(aq[ci]?.current?.pm2_5),
      pm10Live = Number(aq[ci]?.current?.pm10);
    const pm25 = Number.isFinite(pmLive) && pmLive >= 0 ? pmLive : sa.pm25;
    const pm10 = Number.isFinite(pm10Live) && pm10Live >= 0 ? pm10Live : sa.pm10;
    const aqi = cpcbAqi(pm25, pm10);
    const maxT = Math.max(...diags.map((_, k) => H.temp[i0 + k]));
    const minT = Math.min(...diags.map((_, k) => H.temp[i0 + k]));
    const maxG = Math.max(...diags.map((_, k) => H.gust[i0 + k]));
    const rain12 = diags.reduce((s, _, k) => s + H.precip[i0 + k], 0);
    const snow12 = diags.reduce((s, _, k) => s + H.snow[i0 + k], 0);
    const fog = diags.some((d) => d.fog);
    // pick the most severe hazard
    const cands: [HazardKind, Level, string][] = [];
    if (peak.tornadoIndex >= 0.5 && peak.thunderProb >= 35)
      cands.push([
        "tornado",
        peak.tornadoIndex >= 2 ? "red" : peak.tornadoIndex >= 1 ? "orange" : "yellow",
        `Tornado potential ${peak.tornadoIndex}`,
      ]);
    if (peak.thunderProb >= 35)
      cands.push([
        peak.hail ? "hail" : "thunder",
        peak.stage === "Severe thunderstorm" ? "red" : peak.thunderProb >= 70 ? "orange" : "yellow",
        `${peak.stage} ${peak.thunderProb}%`,
      ]);
    if (rain12 >= 30)
      cands.push([
        "rain",
        rain12 >= 100 ? "red" : rain12 >= 60 ? "orange" : "yellow",
        `${Math.round(rain12)} mm rain in 12 h`,
      ]);
    if (maxG >= 50)
      cands.push([
        "wind",
        maxG >= 90 ? "red" : maxG >= 70 ? "orange" : "yellow",
        `Gusts ${Math.round(maxG)} km/h`,
      ]);
    const heatThr = elev > 1000 ? 30 : 40;
    if (maxT >= heatThr)
      cands.push([
        "heat",
        maxT >= heatThr + 5 ? "red" : maxT >= heatThr + 3 ? "orange" : "yellow",
        `Heat ${Math.round(maxT)}°C`,
      ]);
    const coldThr = elev > 2500 ? -12 : elev > 1000 ? -3 : 4;
    if (minT <= coldThr)
      cands.push(["cold", minT <= coldThr - 4 ? "orange" : "yellow", `Cold ${Math.round(minT)}°C`]);
    if (snow12 >= 2)
      cands.push(["snow", snow12 >= 10 ? "orange" : "yellow", `${Math.round(snow12)} cm snow`]);
    if (fog) cands.push(["fog", "yellow", "Dense fog"]);
    if (aqi.value > 200)
      cands.push([
        "smog",
        aqi.value > 400 ? "red" : aqi.value > 300 ? "orange" : "yellow",
        `AQI ${aqi.value} ${aqi.category}`,
      ]);
    const order: HazardKind[] = [
      "tornado",
      "hail",
      "thunder",
      "rain",
      "wind",
      "heat",
      "snow",
      "cold",
      "smog",
      "fog",
    ];
    cands.sort(
      (a, b) => LEVEL_RANK[b[1]] - LEVEL_RANK[a[1]] || order.indexOf(a[0]) - order.indexOf(b[0]),
    );
    const [kind, level, label] = cands[0] ?? ["calm", "green", "No significant weather"];
    const share = st.total ? st.live / st.total : 0;
    return {
      city,
      temp: H.temp[i0],
      feels: H.feels[i0],
      rh: H.rh[i0],
      wind: H.wind[i0],
      windDir: H.windDir[i0],
      gust: H.gust[i0],
      precip: H.precip[i0],
      cloud: H.cloud[i0],
      code: H.code[i0],
      pm25,
      aqi: aqi.value,
      aqiCat: aqi.category,
      kind,
      level,
      label,
      peak,
      building: peak.stormScore - now.stormScore >= 15 && peak.stormScore >= 35,
      hoursToPeak,
      source: (share >= 0.98 ? "live" : share <= 0.02 ? "synthetic" : "mixed") as Source,
    } satisfies Hotspot;
  });
  void addDays;
  cache = { t: Date.now(), v: out };
  return out;
}
