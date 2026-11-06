export type Source = "live" | "mixed" | "synthetic";

export type SectionKey =
  | "meta"
  | "hourly"
  | "daily"
  | "recent"
  | "normals"
  | "history"
  | "projections"
  | "air"
  | "flood"
  | "marine";

export interface Meta {
  lat: number;
  lon: number;
  name: string;
  district: string;
  state: string;
  country: string;
  elevation: number;
  coastKm: number;
  region: string;
  nearest: string;
}

/** Hourly arrays share the `time` axis (Asia/Kolkata local "YYYY-MM-DDTHH:00"). Wind in km/h. */
export interface HourlyData {
  time: string[];
  temp: number[];
  rh: number[];
  dew: number[];
  feels: number[];
  precip: number[];
  precipProb: number[];
  code: number[];
  cloud: number[];
  wind: number[];
  windDir: number[];
  gust: number[];
  pressure: number[];
  visibility: number[];
  uv: number[];
  cape: number[];
  li: number[];
  cin: number[];
  freezing: number[];
  wind925: number[];
  dir925: number[];
  wind500: number[];
  dir500: number[];
  isDay: number[];
  snow: number[];
  soilMoist: number[];
}
export type HourlyKey = Exclude<keyof HourlyData, "time">;

export interface DailyData {
  time: string[];
  tmax: number[];
  tmin: number[];
  precip: number[];
  precipProb: number[];
  code: number[];
  windMax: number[];
  gustMax: number[];
  uvMax: number[];
  et0: number[];
  snow: number[];
  sunrise: string[];
  sunset: string[];
}

export interface RecentDaily {
  time: string[];
  tmax: number[];
  tmin: number[];
  precip: number[];
}

/** 12 monthly climate normals. Wind km/h, solar kWh/m²/day. */
export interface Normals {
  tmean: number[];
  tmax: number[];
  tmin: number[];
  precip: number[];
  rh: number[];
  wind: number[];
  solar: number[];
}

export interface History {
  years: number[];
  tmean: number[];
  tmaxMean: number[];
  precip: number[];
  hotDays: number[];
  heavyRainDays: number[];
  coldNights: number[];
  maxTmax: number[];
  maxDailyRain: number[];
  /** 73 pentad mean rainfall (mm/day), used for monsoon onset/withdrawal. */
  pentadRain: number[];
}

export interface Projections {
  models: string[];
  years: number[];
  tmean: number[];
  tmeanLo: number[];
  tmeanHi: number[];
  precip: number[];
  precipLo: number[];
  precipHi: number[];
  hotDays: number[];
  baselineTmean: number;
  baselinePrecip: number;
  baselineHotDays: number;
}

export interface AirData {
  current: {
    pm25: number;
    pm10: number;
    no2: number;
    so2: number;
    o3: number;
    co: number;
    dust: number;
    aod: number;
    usAqi: number;
  };
  hourly: { time: string[]; pm25: number[]; pm10: number[]; o3: number[]; no2: number[] };
}

export interface FloodData {
  time: string[];
  discharge: number[];
  p50: number;
  p90: number;
  p99: number;
}

export interface MarineData {
  coastal: boolean;
  time: string[];
  waveMax: number[];
  swellMax: number[];
}

export interface ClimateProfile {
  meta: Meta;
  hourly: HourlyData;
  daily: DailyData;
  recent: RecentDaily;
  normals: Normals;
  history: History;
  projections: Projections;
  air: AirData;
  flood: FloodData;
  marine: MarineData;
  sources: Record<SectionKey, Source>;
  /** Share (0–1) of values in each section that came from live data. */
  liveShare: Record<SectionKey, number>;
  /** Human-readable dataset names used per section. */
  datasets: Record<SectionKey, string>;
  generatedAt: string;
}
