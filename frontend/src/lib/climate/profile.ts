/* eslint-disable @typescript-eslint/no-explicit-any -- parses untyped upstream API JSON */
/**
 * Builds a complete ClimateProfile for a coordinate by fusing every open dataset
 * we can reach with the synthetic baseline. Delivers progressively: the synthetic
 * profile is emitted instantly, then each live dataset patches it as it arrives.
 */
import type { ClimateProfile, HourlyData, HourlyKey, SectionKey, Source } from "./types";
import { coastDistanceKm, nearestCity, regionOf, REGION_LABEL, syntheticElevation } from "./geo";
import { addDays, dailyAxis, hourlyAxis, istDateKey } from "./time";
import {
  dailyFromHourly,
  syntheticAir,
  syntheticFlood,
  syntheticHistory,
  syntheticHourly,
  syntheticMarine,
  syntheticNormals,
  syntheticProjections,
  syntheticRecent,
  recentAxis,
} from "./synthetic";
import { fuse, fuseStr, RANGES, share, type MergeStats, type Range } from "./clean";

const OM = "https://api.open-meteo.com/v1";
const TZ = "timezone=Asia%2FKolkata";

/* ---------------- fetch + cache ---------------- */
async function getJSON<T = any>(url: string, timeoutMs = 15000): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error(`${res.status} ${url.split("?")[0]}`);
    const j = await res.json();
    if (j && j.error) throw new Error(j.reason || "API error");
    return j as T;
  } finally {
    clearTimeout(t);
  }
}
const mem = new Map<string, unknown>();
async function cached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
  persist = false,
): Promise<T> {
  const hit = mem.get(key) as { t: number; v: T } | undefined;
  if (hit && Date.now() - hit.t < ttlMs) return hit.v;
  if (persist) {
    try {
      const s = localStorage.getItem("bct:" + key);
      if (s) {
        const o = JSON.parse(s) as { t: number; v: T };
        if (Date.now() - o.t < ttlMs) {
          mem.set(key, o);
          return o.v;
        }
      }
    } catch {
      /* storage unavailable */
    }
  }
  const v = await fn();
  const o = { t: Date.now(), v };
  mem.set(key, o);
  if (persist) {
    try {
      localStorage.setItem("bct:" + key, JSON.stringify(o));
    } catch {
      try {
        Object.keys(localStorage)
          .filter((k) => k.startsWith("bct:"))
          .slice(0, 4)
          .forEach((k) => localStorage.removeItem(k));
      } catch {
        /* ignore */
      }
    }
  }
  return v;
}
const grid = (x: number) => (Math.round(x * 4) / 4).toFixed(2);
const DAY = 86400000;

/* ---------------- source definitions ---------------- */
const HOURLY_VARS: [HourlyKey, string, Range][] = [
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
  ["uv", "uv_index", RANGES.uv],
  ["cape", "cape", RANGES.cape],
  ["li", "lifted_index", RANGES.li],
  ["cin", "convective_inhibition", RANGES.cin],
  ["freezing", "freezing_level_height", RANGES.height],
  ["wind925", "wind_speed_925hPa", RANGES.wind],
  ["dir925", "wind_direction_925hPa", RANGES.dir],
  ["wind500", "wind_speed_500hPa", RANGES.wind],
  ["dir500", "wind_direction_500hPa", RANGES.dir],
  ["isDay", "is_day", RANGES.flag],
  ["snow", "snowfall", RANGES.snow],
  ["soilMoist", "soil_moisture_0_to_1cm", RANGES.soil],
];
const CORE_HOURLY = new Set([
  "temperature_2m",
  "relative_humidity_2m",
  "dew_point_2m",
  "apparent_temperature",
  "precipitation",
  "precipitation_probability",
  "weather_code",
  "cloud_cover",
  "wind_speed_10m",
  "wind_direction_10m",
  "wind_gusts_10m",
  "pressure_msl",
  "visibility",
  "uv_index",
  "cape",
  "is_day",
  "snowfall",
]);
const DAILY_VARS =
  "temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,weather_code,wind_speed_10m_max,wind_gusts_10m_max,uv_index_max,et0_fao_evapotranspiration,snowfall_sum,sunrise,sunset";

async function fetchForecast(lat: number, lon: number) {
  const base = `${OM}/forecast?latitude=${lat}&longitude=${lon}&${TZ}&past_days=1&forecast_days=16&daily=${DAILY_VARS}`;
  try {
    return await getJSON(`${base}&hourly=${HOURLY_VARS.map((v) => v[1]).join(",")}`);
  } catch {
    // retry with the core variable set if a level/variable is rejected
    return await getJSON(
      `${base}&hourly=${HOURLY_VARS.map((v) => v[1])
        .filter((v) => CORE_HOURLY.has(v))
        .join(",")}`,
    );
  }
}

async function fetchGeocode(lat: number, lon: number) {
  try {
    const j = await getJSON(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`,
      8000,
    );
    const admin: any[] = j?.localityInfo?.administrative ?? [];
    const district =
      admin.find((a) => a.adminLevel === 5)?.name ??
      admin.find((a) => a.adminLevel === 6)?.name ??
      "";
    return {
      name: j.city || j.locality || "",
      district,
      state: j.principalSubdivision || "",
      country: j.countryName || "",
    };
  } catch {
    const j = await getJSON(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=10`,
      8000,
    );
    const a = j?.address ?? {};
    return {
      name: a.city || a.town || a.village || a.county || "",
      district: a.state_district || a.county || "",
      state: a.state || "",
      country: a.country || "",
    };
  }
}

async function fetchPower(lat: number, lon: number) {
  const params = "T2M,T2M_MAX,T2M_MIN,PRECTOTCORR,RH2M,WS2M,ALLSKY_SFC_SW_DWN";
  return getJSON(
    `https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=${params}&community=AG&longitude=${lon}&latitude=${lat}&format=JSON`,
    25000,
  );
}

/* ---------------- helpers ---------------- */
const MONTH_KEYS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];
const DIM = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const r1 = (x: number, d = 1) => Math.round(x * 10 ** d) / 10 ** d;

function srcOf(liveShare: number): Source {
  return liveShare >= 0.98 ? "live" : liveShare <= 0.02 ? "synthetic" : "mixed";
}

export type ProfileListener = (
  p: ClimateProfile,
  status: Record<string, "pending" | "ok" | "failed">,
) => void;

export function syntheticProfile(lat: number, lon: number): ClimateProfile {
  const today = istDateKey();
  const elev = syntheticElevation(lat, lon);
  const coastKm = coastDistanceKm(lat, lon);
  const n = syntheticNormals(lat, lon, elev, coastKm);
  const hAxis = hourlyAxis(addDays(today, -1), 17);
  const hourly = syntheticHourly(hAxis, lat, lon, elev, n);
  const daily = dailyFromHourly(hourly, lat, lon, n);
  const recent = syntheticRecent(recentAxis(today, 92), lat, lon, n);
  const lastYear = Number(today.slice(0, 4)) - 1;
  const nc = nearestCity(lat, lon);
  const region = regionOf(lat, lon);
  const sections: SectionKey[] = [
    "meta",
    "hourly",
    "daily",
    "recent",
    "normals",
    "history",
    "projections",
    "air",
    "flood",
    "marine",
  ];
  return {
    meta: {
      lat,
      lon,
      name: nc.km < 25 ? nc.name : `Near ${nc.name}`,
      district: nc.km < 25 ? nc.name : "",
      state: nc.state,
      country: "India",
      elevation: elev,
      coastKm,
      region: REGION_LABEL[region],
      nearest: `${nc.name} (${nc.km} km)`,
    },
    hourly,
    daily,
    recent,
    normals: n,
    history: syntheticHistory(lat, lon, n, 1991, lastYear),
    projections: syntheticProjections(lat, lon, n),
    air: syntheticAir(hourlyAxis(addDays(today, -1), 6), lat, lon),
    flood: syntheticFlood(dailyAxis(addDays(today, -7), 37), lat, lon, n, recent.precip),
    marine: syntheticMarine(dailyAxis(today, 7), lat, lon, coastKm),
    sources: Object.fromEntries(sections.map((s) => [s, "synthetic"])) as Record<
      SectionKey,
      Source
    >,
    liveShare: Object.fromEntries(sections.map((s) => [s, 0])) as Record<SectionKey, number>,
    datasets: {
      meta: "Built-in India gazetteer + terrain model",
      hourly: "Synthetic weather generator",
      daily: "Synthetic weather generator",
      recent: "Synthetic weather generator",
      normals: "Synthetic IMD-pattern climatology",
      history: "Synthetic climatology + observed warming trend",
      projections: "Synthetic CMIP6-like warming pathway",
      air: "Synthetic regional pollution model",
      flood: "Synthetic hydrology model",
      marine: "Synthetic sea-state model",
    },
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Load everything for a coordinate. Calls `onUpdate` after each dataset lands.
 * Returns a cancel function.
 */
export function loadProfile(
  lat: number,
  lon: number,
  onUpdate: ProfileListener,
  opts: { projections?: boolean } = {},
) {
  let cancelled = false;
  const p = syntheticProfile(lat, lon);
  const status: Record<string, "pending" | "ok" | "failed"> = {
    geocode: "pending",
    elevation: "pending",
    forecast: "pending",
    recent: "pending",
    air: "pending",
    flood: "pending",
    marine: "pending",
    power: "pending",
    era5: "pending",
    floodHistory: "pending",
    cmip6: opts.projections === false ? "failed" : "pending",
  };
  const emit = () => {
    if (!cancelled) {
      p.generatedAt = new Date().toISOString();
      onUpdate(structuredClone(p), { ...status });
    }
  };
  const mark = (k: string, ok: boolean) => {
    status[k] = ok ? "ok" : "failed";
    emit();
  };
  const setShare = (k: SectionKey, s: number, dataset: string) => {
    p.liveShare[k] = s;
    p.sources[k] = srcOf(s);
    if (s > 0.02) p.datasets[k] = dataset + (s < 0.98 ? " · gaps filled synthetically" : "");
  };
  emit();
  const today = istDateKey();
  const g4 = `${grid(lat)},${grid(lon)}`;

  // --- meta ---
  fetchGeocode(lat, lon)
    .then((g) => {
      if (cancelled) return;
      p.meta.name = g.name || p.meta.name;
      p.meta.district = g.district || p.meta.district;
      p.meta.state = g.state || p.meta.state;
      p.meta.country = g.country || p.meta.country;
      setShare(
        "meta",
        Math.max(p.liveShare.meta, 0.5),
        "BigDataCloud / OSM Nominatim reverse geocoding",
      );
      mark("geocode", true);
    })
    .catch(() => mark("geocode", false));

  getJSON(`${OM}/elevation?latitude=${lat}&longitude=${lon}`, 8000)
    .then((j) => {
      const e = j?.elevation?.[0];
      if (typeof e === "number" && e > -100 && e < 9000) {
        p.meta.elevation = Math.round(e);
        setShare("meta", 1, "Copernicus DEM GLO-90 + reverse geocoding");
      }
      mark("elevation", true);
    })
    .catch(() => mark("elevation", false));

  // --- forecast hourly + daily ---
  cached(`fc:${lat.toFixed(3)},${lon.toFixed(3)}`, 15 * 60000, () => fetchForecast(lat, lon))
    .then((j) => {
      if (cancelled) return;
      const H = p.hourly,
        st: MergeStats = { live: 0, total: 0 };
      const lt: string[] | undefined = j?.hourly?.time;
      const next = { time: H.time } as HourlyData;
      for (const [k, name, range] of HOURLY_VARS) {
        (next as any)[k] = fuse(H.time, H[k], lt, j?.hourly?.[name], range, st, {
          round: k === "soilMoist" ? 3 : 1,
        });
      }
      // dew/rh consistency: dew cannot exceed temp
      next.dew = next.dew.map((d, i) => Math.min(d, next.temp[i]));
      p.hourly = next;
      setShare(
        "hourly",
        share(st),
        "Open-Meteo best-match NWP (ECMWF IFS · NCEP GFS · ICON · JMA blend)",
      );
      const D = p.daily,
        sd: MergeStats = { live: 0, total: 0 };
      const dt: string[] | undefined = j?.daily?.time,
        dj = j?.daily ?? {};
      p.daily = {
        time: D.time,
        tmax: fuse(D.time, D.tmax, dt, dj.temperature_2m_max, RANGES.temp, sd),
        tmin: fuse(D.time, D.tmin, dt, dj.temperature_2m_min, RANGES.temp, sd),
        precip: fuse(D.time, D.precip, dt, dj.precipitation_sum, RANGES.precip, sd),
        precipProb: fuse(
          D.time,
          D.precipProb,
          dt,
          dj.precipitation_probability_max,
          RANGES.prob,
          sd,
        ),
        code: fuse(D.time, D.code, dt, dj.weather_code, RANGES.code, sd, { round: 0 }),
        windMax: fuse(D.time, D.windMax, dt, dj.wind_speed_10m_max, RANGES.wind, sd),
        gustMax: fuse(D.time, D.gustMax, dt, dj.wind_gusts_10m_max, RANGES.wind, sd),
        uvMax: fuse(D.time, D.uvMax, dt, dj.uv_index_max, RANGES.uv, sd),
        et0: fuse(D.time, D.et0, dt, dj.et0_fao_evapotranspiration, RANGES.et0, sd, { round: 2 }),
        snow: fuse(D.time, D.snow, dt, dj.snowfall_sum, RANGES.snow, sd),
        sunrise: fuseStr(D.time, D.sunrise, dt, dj.sunrise),
        sunset: fuseStr(D.time, D.sunset, dt, dj.sunset),
      };
      setShare("daily", share(sd), "Open-Meteo daily aggregates");
      mark("forecast", true);
    })
    .catch(() => mark("forecast", false));

  // --- recent 92 days (drought / departures) ---
  cached(`rc:${g4}:${today}`, 6 * 3600000, () =>
    getJSON(
      `${OM}/forecast?latitude=${lat}&longitude=${lon}&${TZ}&past_days=92&forecast_days=1&daily=temperature_2m_max,temperature_2m_min,precipitation_sum`,
    ),
  )
    .then((j) => {
      const R = p.recent,
        s: MergeStats = { live: 0, total: 0 },
        t = j?.daily?.time;
      p.recent = {
        time: R.time,
        tmax: fuse(R.time, R.tmax, t, j?.daily?.temperature_2m_max, RANGES.temp, s),
        tmin: fuse(R.time, R.tmin, t, j?.daily?.temperature_2m_min, RANGES.temp, s),
        precip: fuse(R.time, R.precip, t, j?.daily?.precipitation_sum, RANGES.precip, s),
      };
      setShare("recent", share(s), "Open-Meteo analysis (last 92 days)");
      mark("recent", true);
    })
    .catch(() => mark("recent", false));

  // --- air quality ---
  cached(`aq:${g4}`, 30 * 60000, () =>
    getJSON(
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&${TZ}&past_days=1&forecast_days=5&current=pm2_5,pm10,nitrogen_dioxide,sulphur_dioxide,ozone,carbon_monoxide,dust,aerosol_optical_depth,us_aqi&hourly=pm2_5,pm10,ozone,nitrogen_dioxide`,
    ),
  )
    .then((j) => {
      const A = p.air,
        s: MergeStats = { live: 0, total: 0 },
        t = j?.hourly?.time;
      const hourly = {
        time: A.hourly.time,
        pm25: fuse(A.hourly.time, A.hourly.pm25, t, j?.hourly?.pm2_5, RANGES.conc, s, { round: 0 }),
        pm10: fuse(A.hourly.time, A.hourly.pm10, t, j?.hourly?.pm10, RANGES.conc, s, { round: 0 }),
        o3: fuse(A.hourly.time, A.hourly.o3, t, j?.hourly?.ozone, RANGES.conc, s, { round: 0 }),
        no2: fuse(A.hourly.time, A.hourly.no2, t, j?.hourly?.nitrogen_dioxide, RANGES.conc, s, {
          round: 0,
        }),
      };
      const c = j?.current ?? {};
      const pick = (v: unknown, fb: number, rg: Range) => {
        s.total++;
        const n = Number(v);
        if (v != null && Number.isFinite(n) && n >= rg[0] && n <= rg[1]) {
          s.live++;
          return n;
        }
        return fb;
      };
      p.air = {
        hourly,
        current: {
          pm25: pick(c.pm2_5, A.current.pm25, RANGES.conc),
          pm10: pick(c.pm10, A.current.pm10, RANGES.conc),
          no2: pick(c.nitrogen_dioxide, A.current.no2, RANGES.conc),
          so2: pick(c.sulphur_dioxide, A.current.so2, RANGES.conc),
          o3: pick(c.ozone, A.current.o3, RANGES.conc),
          co: pick(c.carbon_monoxide, A.current.co, RANGES.conc),
          dust: pick(c.dust, A.current.dust, RANGES.conc),
          aod: pick(c.aerosol_optical_depth, A.current.aod, RANGES.aod),
          usAqi: pick(c.us_aqi, A.current.usAqi, RANGES.aqi),
        },
      };
      setShare("air", share(s), "CAMS global atmospheric composition (via Open-Meteo)");
      mark("air", true);
    })
    .catch(() => mark("air", false));

  // --- river discharge forecast + history ---
  const floodFc = cached(`fl:${g4}:${today}`, 6 * 3600000, () =>
    getJSON(
      `https://flood-api.open-meteo.com/v1/flood?latitude=${lat}&longitude=${lon}&daily=river_discharge&past_days=7&forecast_days=30`,
    ),
  );
  floodFc
    .then((j) => {
      const F = p.flood,
        s: MergeStats = { live: 0, total: 0 };
      p.flood = {
        ...F,
        discharge: fuse(
          F.time,
          F.discharge,
          j?.daily?.time,
          j?.daily?.river_discharge,
          RANGES.discharge,
          s,
        ),
      };
      setShare("flood", share(s), "GloFAS v4 river discharge (via Open-Meteo)");
      mark("flood", true);
    })
    .catch(() => mark("flood", false));

  // --- marine ---
  if (p.marine.coastal) {
    cached(`mr:${g4}`, 3 * 3600000, () =>
      getJSON(
        `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&${TZ}&forecast_days=7&daily=wave_height_max,swell_wave_height_max`,
      ),
    )
      .then((j) => {
        const M = p.marine,
          s: MergeStats = { live: 0, total: 0 };
        p.marine = {
          ...M,
          waveMax: fuse(
            M.time,
            M.waveMax,
            j?.daily?.time,
            j?.daily?.wave_height_max,
            RANGES.wave,
            s,
          ),
          swellMax: fuse(
            M.time,
            M.swellMax,
            j?.daily?.time,
            j?.daily?.swell_wave_height_max,
            RANGES.wave,
            s,
          ),
        };
        setShare("marine", share(s), "MeteoFrance MFWAM / ECMWF WAM wave models");
        mark("marine", true);
      })
      .catch(() => mark("marine", false));
  } else {
    setShare("marine", 1, "Not applicable (inland)");
    p.datasets.marine = "Inland location — sea state not applicable";
    mark("marine", true);
  }

  // --- NASA POWER climatology (fast, small) ---
  const powerP = cached(`pw:${g4}`, 30 * DAY, () => fetchPower(lat, lon), true).then((j) => {
    const par = j?.properties?.parameter;
    if (!par) throw new Error("no POWER data");
    const m = (k: string, f = (x: number) => x) =>
      MONTH_KEYS.map((mk) => {
        const v = Number(par[k]?.[mk]);
        return Number.isFinite(v) && v > -998 ? f(v) : NaN;
      });
    return {
      tmean: m("T2M"),
      tmax: m("T2M_MAX"),
      tmin: m("T2M_MIN"),
      precip: m("PRECTOTCORR").map((v, i) => v * DIM[i]),
      rh: m("RH2M"),
      wind: m("WS2M", (x) => x * 3.6),
      solar: m("ALLSKY_SFC_SW_DWN"),
    };
  });
  powerP
    .then((pw) => {
      const N = p.normals;
      let live = 0,
        tot = 0;
      const take = (a: number[], b: number[], d = 1) =>
        a.map((v, i) => {
          tot++;
          if (Number.isFinite(b[i])) {
            live++;
            return r1(b[i], d);
          }
          return v;
        });
      p.normals = {
        tmean: take(N.tmean, pw.tmean),
        tmax: take(N.tmax, pw.tmax),
        tmin: take(N.tmin, pw.tmin),
        precip: take(N.precip, pw.precip, 0),
        rh: take(N.rh, pw.rh, 0),
        wind: take(N.wind, pw.wind),
        solar: take(N.solar, pw.solar, 2),
      };
      setShare("normals", live / tot, "NASA POWER (MERRA-2 / CERES) long-term climatology");
      mark("power", true);
    })
    .catch(() => mark("power", false));

  // --- ERA5 archive 1991–last year (history + refined normals), then flood history, then CMIP6 ---
  const lastYear = Number(today.slice(0, 4)) - 1;
  (async () => {
    try {
      const j = await cached(
        `era5:${g4}:${lastYear}`,
        60 * DAY,
        () =>
          getJSON(
            `https://archive-api.open-meteo.com/v1/archive?latitude=${grid(lat)}&longitude=${grid(lon)}&start_date=1991-01-01&end_date=${lastYear}-12-31&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&${TZ}`,
            45000,
          ),
        true,
      );
      if (cancelled) return;
      applyEra5(p, j, lastYear);
      setShare("history", 1, "ECMWF ERA5 reanalysis 1991–" + lastYear);
      // fuse ERA5 temperature/precip normals with POWER (rh/wind/solar from POWER)
      const era = era5Normals(j);
      if (era) {
        const hadPower = status.power === "ok";
        p.normals = {
          ...p.normals,
          tmean: era.tmean,
          tmax: era.tmax,
          tmin: era.tmin,
          precip: era.precip,
        };
        setShare(
          "normals",
          hadPower ? 1 : 4 / 7,
          hadPower
            ? "ERA5 1991–2020 (temperature, rain) + NASA POWER (humidity, wind, solar)"
            : "ERA5 1991–2020 normals",
        );
      }
      mark("era5", true);
    } catch {
      mark("era5", false);
    }

    try {
      const yday = addDays(today, -1);
      const j = await cached(
        `flh:${g4}`,
        30 * DAY,
        () =>
          getJSON(
            `https://flood-api.open-meteo.com/v1/flood?latitude=${lat}&longitude=${lon}&daily=river_discharge&start_date=2000-01-01&end_date=${yday}`,
            30000,
          ),
        true,
      );
      const q = (j?.daily?.river_discharge ?? [])
        .filter((x: unknown) => typeof x === "number" && (x as number) >= 0)
        .sort((a: number, b: number) => a - b);
      if (q.length > 365) {
        const pct = (f: number) => r1(q[Math.min(q.length - 1, Math.floor(q.length * f))]);
        p.flood = { ...p.flood, p50: pct(0.5), p90: pct(0.9), p99: pct(0.99) };
        p.datasets.flood = "GloFAS v4 forecast + 2000–present return levels";
      }
      mark("floodHistory", true);
    } catch {
      mark("floodHistory", false);
    }

    if (opts.projections === false || cancelled) return;
    try {
      const models = ["EC_Earth3P_HR", "MRI_AGCM3_2_S"];
      const j = await cached(
        `cmip:${g4}`,
        180 * DAY,
        () =>
          getJSON(
            `https://climate-api.open-meteo.com/v1/climate?latitude=${grid(lat)}&longitude=${grid(lon)}&start_date=1995-01-01&end_date=2050-12-31&models=${models.join(",")}&daily=temperature_2m_max,temperature_2m_mean,precipitation_sum`,
            60000,
          ),
        true,
      );
      if (cancelled) return;
      if (applyCmip(p, j, models))
        setShare(
          "projections",
          1,
          "CMIP6 HighResMIP (EC-Earth3P-HR, MRI-AGCM3-2-S), delta bias-corrected to observed baseline",
        );
      mark("cmip6", true);
    } catch {
      mark("cmip6", false);
    }
  })();

  return () => {
    cancelled = true;
  };
}

/* ---------------- ERA5 + CMIP6 post-processing ---------------- */
function era5Normals(j: any) {
  const t: string[] = j?.daily?.time ?? [];
  if (!t.length) return null;
  const tx: number[] = j.daily.temperature_2m_max,
    tn: number[] = j.daily.temperature_2m_min,
    pr: number[] = j.daily.precipitation_sum;
  const acc = Array.from({ length: 12 }, () => ({
    tx: [] as number[],
    tn: [] as number[],
    p: new Map<number, number>(),
  }));
  t.forEach((d, i) => {
    const y = Number(d.slice(0, 4));
    if (y < 1991 || y > 2020) return;
    const m = Number(d.slice(5, 7)) - 1;
    if (typeof tx[i] === "number") acc[m].tx.push(tx[i]);
    if (typeof tn[i] === "number") acc[m].tn.push(tn[i]);
    if (typeof pr[i] === "number") acc[m].p.set(y, (acc[m].p.get(y) ?? 0) + pr[i]);
  });
  if (acc.some((a) => a.tx.length < 100)) return null;
  const tmax = acc.map((a) => r1(mean(a.tx))),
    tmin = acc.map((a) => r1(mean(a.tn)));
  return {
    tmax,
    tmin,
    tmean: tmax.map((x, i) => r1((x + tmin[i]) / 2)),
    precip: acc.map((a) => Math.round(mean([...a.p.values()]))),
  };
}

function applyEra5(p: ClimateProfile, j: any, lastYear: number) {
  const t: string[] = j?.daily?.time ?? [];
  const tx: number[] = j?.daily?.temperature_2m_max ?? [],
    tn: number[] = j?.daily?.temperature_2m_min ?? [],
    pr: number[] = j?.daily?.precipitation_sum ?? [];
  if (t.length < 3000) throw new Error("short ERA5");
  const by = new Map<
    number,
    {
      tx: number[];
      tm: number[];
      p: number;
      hot: number;
      heavy: number;
      cold: number;
      mx: number;
      mr: number;
    }
  >();
  const pent = Array.from({ length: 73 }, () => [] as number[]);
  t.forEach((d, i) => {
    const y = Number(d.slice(0, 4));
    if (!by.has(y)) by.set(y, { tx: [], tm: [], p: 0, hot: 0, heavy: 0, cold: 0, mx: -99, mr: 0 });
    const o = by.get(y)!;
    const a = tx[i],
      b = tn[i],
      r = pr[i];
    if (typeof a === "number" && typeof b === "number") {
      o.tx.push(a);
      o.tm.push((a + b) / 2);
      if (a >= 40) o.hot++;
      if (b <= 10) o.cold++;
      if (a > o.mx) o.mx = a;
    }
    if (typeof r === "number") {
      o.p += r;
      if (r >= 64.5) o.heavy++;
      if (r > o.mr) o.mr = r;
      const doy = Math.floor((Date.parse(d + "T00:00:00Z") - Date.UTC(y, 0, 1)) / DAY);
      pent[Math.min(72, Math.floor(doy / 5))].push(r);
    }
  });
  const H = p.history;
  const years = [...by.keys()].filter((y) => y <= lastYear && by.get(y)!.tm.length > 330).sort();
  const val = (y: number) => by.get(y)!;
  p.history = {
    years,
    tmean: years.map((y) => r1(mean(val(y).tm), 2)),
    tmaxMean: years.map((y) => r1(mean(val(y).tx), 2)),
    precip: years.map((y) => Math.round(val(y).p)),
    hotDays: years.map((y) => val(y).hot),
    heavyRainDays: years.map((y) => val(y).heavy),
    coldNights: years.map((y) => val(y).cold),
    maxTmax: years.map((y) => r1(val(y).mx)),
    maxDailyRain: years.map((y) => Math.round(val(y).mr)),
    pentadRain: pent.map((a, i) => (a.length ? r1(mean(a), 2) : H.pentadRain[i])),
  };
}

function applyCmip(p: ClimateProfile, j: any, models: string[]): boolean {
  const t: string[] = j?.daily?.time ?? [];
  if (!t.length) return false;
  const yearsIdx = new Map<number, number[]>();
  t.forEach((d, i) => {
    const y = Number(d.slice(0, 4));
    if (!yearsIdx.has(y)) yearsIdx.set(y, []);
    yearsIdx.get(y)!.push(i);
  });
  const series = models
    .map((m) => {
      const key = (v: string) =>
        j.daily[`${v}_${m}`] ?? (models.length === 1 ? j.daily[v] : undefined);
      const tm: number[] = key("temperature_2m_mean") ?? [],
        tx: number[] = key("temperature_2m_max") ?? [],
        pr: number[] = key("precipitation_sum") ?? [];
      const annual = new Map<number, { t: number; p: number; hot: number }>();
      for (const [y, idx] of yearsIdx) {
        const tv = idx.map((i) => tm[i]).filter((x) => typeof x === "number");
        const pv = idx.map((i) => pr[i]).filter((x) => typeof x === "number");
        if (tv.length < 300) continue;
        annual.set(y, {
          t: mean(tv),
          p: pv.reduce((a, b) => a + b, 0),
          hot: idx.filter((i) => typeof tx[i] === "number" && tx[i] >= 40).length,
        });
      }
      return annual;
    })
    .filter((a) => a.size > 40);
  if (!series.length) return false;
  // observed baseline (ERA5 1995–2014 if we have it, else normals)
  const H = p.history;
  const bIdx = H.years.map((y, i) => (y >= 1995 && y <= 2014 ? i : -1)).filter((i) => i >= 0);
  const obsT = bIdx.length ? mean(bIdx.map((i) => H.tmean[i])) : mean(p.normals.tmean);
  const obsP = bIdx.length
    ? mean(bIdx.map((i) => H.precip[i]))
    : p.normals.precip.reduce((a, b) => a + b, 0);
  const obsHot = bIdx.length ? mean(bIdx.map((i) => H.hotDays[i])) : p.projections.baselineHotDays;
  const deltas = series.map((s) => {
    const base = [...s.entries()].filter(([y]) => y >= 1995 && y <= 2014).map(([, v]) => v);
    return {
      s,
      bt: mean(base.map((b) => b.t)),
      bp: mean(base.map((b) => b.p)),
      bh: mean(base.map((b) => b.hot)),
    };
  });
  const out = {
    years: [] as number[],
    tmean: [] as number[],
    tmeanLo: [] as number[],
    tmeanHi: [] as number[],
    precip: [] as number[],
    precipLo: [] as number[],
    precipHi: [] as number[],
    hotDays: [] as number[],
  };
  const S = p.projections;
  for (let y = 2015; y <= 2050; y++) {
    const ts: number[] = [],
      ps: number[] = [],
      hs: number[] = [];
    for (const d of deltas) {
      // 5-year centred running mean to suppress single-model year-to-year noise
      const win = [y - 2, y - 1, y, y + 1, y + 2].map((k) => d.s.get(k)).filter(Boolean) as {
        t: number;
        p: number;
        hot: number;
      }[];
      if (!win.length) continue;
      ts.push(obsT + mean(win.map((w) => w.t)) - d.bt);
      ps.push(obsP * (mean(win.map((w) => w.p)) / Math.max(1, d.bp)));
      hs.push(Math.max(0, obsHot + mean(win.map((w) => w.hot)) - d.bh));
    }
    const i = y - 2015;
    out.years.push(y);
    if (!ts.length) {
      out.tmean.push(S.tmean[i]);
      out.tmeanLo.push(S.tmeanLo[i]);
      out.tmeanHi.push(S.tmeanHi[i]);
      out.precip.push(S.precip[i]);
      out.precipLo.push(S.precipLo[i]);
      out.precipHi.push(S.precipHi[i]);
      out.hotDays.push(S.hotDays[i]);
      continue;
    }
    const sp = Math.max(0.15, (Math.max(...ts) - Math.min(...ts)) / 2);
    out.tmean.push(r1(mean(ts), 2));
    out.tmeanLo.push(r1(mean(ts) - sp, 2));
    out.tmeanHi.push(r1(mean(ts) + sp, 2));
    const pp = Math.max(obsP * 0.04, (Math.max(...ps) - Math.min(...ps)) / 2);
    out.precip.push(Math.round(mean(ps)));
    out.precipLo.push(Math.round(mean(ps) - pp));
    out.precipHi.push(Math.round(mean(ps) + pp));
    out.hotDays.push(Math.round(mean(hs)));
  }
  p.projections = {
    models: models.slice(0, series.length),
    ...out,
    baselineTmean: r1(obsT, 2),
    baselinePrecip: Math.round(obsP),
    baselineHotDays: Math.round(obsHot),
  };
  return true;
}
