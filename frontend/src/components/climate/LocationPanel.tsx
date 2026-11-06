import { useEffect, useMemo, useState } from "react";
import type { ClimateProfile } from "@/lib/climate/types";
import type { LoadStatus } from "@/lib/climate/useClimate";
import {
  buildUp,
  computeAlerts,
  describeCode,
  diagnoseRange,
  LEVEL_RANK,
  nowIndex,
  type Level,
} from "@/lib/climate/analysis";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SkyScene } from "./SkyScene";
import { LevelPill, SourceTag } from "./ui";
import { fmtDay } from "@/lib/climate/time";
import { Mountain, Pause, Play, Waves } from "lucide-react";
import {
  NowTab,
  ForecastTab,
  StormsTab,
  ClimateTab,
  FutureTab,
  AirWaterTab,
  AlertsTab,
  OverviewTab,
} from "./tabs";

const SOURCE_LABELS: Record<string, string> = {
  geocode: "Geocoding",
  elevation: "Elevation (DEM)",
  forecast: "NWP forecast",
  recent: "Last 92 days",
  air: "Air quality (CAMS)",
  flood: "River flow (GloFAS)",
  marine: "Waves",
  power: "NASA POWER",
  era5: "ERA5 1991–now",
  floodHistory: "Flood return levels",
  cmip6: "CMIP6 projections",
};

export function LocationPanel({
  profile: p,
  status,
  via = "browser",
}: {
  profile: ClimateProfile;
  status: LoadStatus;
  via?: "backend" | "browser";
}) {
  const H = p.hourly;
  const i0 = nowIndex(H);
  const diags = useMemo(() => diagnoseRange(H, i0, 48), [p]);
  const alerts = useMemo(() => computeAlerts(p), [p]);
  const bu = useMemo(() => buildUp(diags), [diags]);
  const top: Level = alerts[0]?.level ?? "green";
  const [hour, setHour] = useState(0);
  const [playing, setPlaying] = useState(true);
  useEffect(() => {
    setHour(0);
  }, [p.meta.lat, p.meta.lon]);
  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => setHour((h) => (h + 1) % 48), 900);
    return () => clearTimeout(t);
  }, [playing, hour]);
  const i = i0 + hour,
    d = diags[hour] ?? diags[0];
  const sky = {
    cloud: H.cloud[i],
    precip: H.precip[i],
    thunderProb: d.thunderProb,
    tornadoIndex: d.tornadoIndex,
    wind: H.wind[i],
    isDay: H.isDay[i],
    visibility: H.visibility[i],
    temp: H.temp[i],
    snow: H.snow[i],
    hail: d.hail,
  };
  const liveCount = Object.values(p.sources).filter((s) => s !== "synthetic").length;
  const pending = Object.values(status).filter((s) => s === "pending").length;

  return (
    <div className="space-y-4 rounded-3xl glass-strong p-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-mono uppercase tracking-widest text-teal">
            {p.meta.region}
          </p>
          <h2 className="mt-1 truncate font-display text-2xl font-bold">
            {p.meta.name || "Selected location"}
          </h2>
          <p className="truncate text-sm text-muted-foreground">
            {[p.meta.district, p.meta.state]
              .filter((v, k, a) => v && a.indexOf(v) === k && v !== p.meta.name)
              .join(", ") || p.meta.country}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono text-muted-foreground">
            <span>
              {p.meta.lat.toFixed(3)}°N {p.meta.lon.toFixed(3)}°E
            </span>
            <span className="inline-flex items-center gap-1">
              <Mountain className="h-3 w-3" />
              {p.meta.elevation} m
            </span>
            <span className="inline-flex items-center gap-1">
              <Waves className="h-3 w-3" />
              {p.meta.coastKm} km to coast
            </span>
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-4xl font-bold leading-none">{Math.round(H.temp[i0])}°</p>
          <p className="mt-1 text-xs text-muted-foreground">{describeCode(H.code[i0])}</p>
          <div className="mt-2">
            <LevelPill level={top}>
              {alerts.length
                ? `${alerts.length} alert${alerts.length > 1 ? "s" : ""}`
                : "All clear"}
            </LevelPill>
          </div>
        </div>
      </div>

      {/* Build-up banner */}
      {bu.building && (
        <div className="flex items-center gap-3 rounded-2xl border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-sm">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-500 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-orange-500" />
          </span>
          <span>
            <b>Storm building:</b> {bu.peak.stage.toLowerCase()} expected in ~{bu.hoursToPeak} h
            (storm score {diags[0].stormScore} → {bu.peak.stormScore}).
          </span>
        </div>
      )}

      {/* Sky simulator */}
      <div className="relative">
        <SkyScene state={sky} />
        <div className="absolute left-3 top-3 rounded-full bg-black/35 px-2.5 py-1 text-[11px] font-mono text-white backdrop-blur">
          {hour === 0 ? "Now" : `+${hour} h`} · {fmtDay(H.time[i])} {H.time[i].slice(11, 16)}
        </div>
        <div className="absolute right-3 top-3 rounded-full bg-black/35 px-2.5 py-1 text-[11px] font-mono text-white backdrop-blur">
          {d.stage}
        </div>
        <div className="absolute bottom-3 left-3 right-3 flex flex-wrap gap-1.5 text-[10px] font-mono text-white">
          {[
            `${Math.round(H.temp[i])}°C`,
            `${H.precip[i].toFixed(1)} mm/h`,
            `⚡ ${d.thunderProb}%`,
            `🌪 ${d.tornadoIndex.toFixed(2)}`,
            `${Math.round(H.wind[i])} km/h`,
            `CAPE ${Math.round(H.cape[i])}`,
          ].map((x) => (
            <span key={x} className="rounded-full bg-black/40 px-2 py-0.5 backdrop-blur">
              {x}
            </span>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          aria-label={playing ? "Pause timeline" : "Play timeline"}
          onClick={() => setPlaying((x) => !x)}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full glass-btn"
        >
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </button>
        <div className="relative flex-1">
          <div className="pointer-events-none absolute inset-x-0 top-1/2 flex h-3 -translate-y-1/2 gap-px overflow-hidden rounded-full">
            {diags.map((x, k) => (
              <span
                key={k}
                className="flex-1"
                style={{
                  background:
                    x.stormScore >= 60
                      ? "#dc2626"
                      : x.stormScore >= 40
                        ? "#f97316"
                        : x.stormScore >= 20
                          ? "#eab308"
                          : "color-mix(in oklab, currentColor 12%, transparent)",
                }}
              />
            ))}
          </div>
          <input
            aria-label="Forecast hour"
            type="range"
            min={0}
            max={47}
            value={hour}
            onChange={(e) => {
              setPlaying(false);
              setHour(Number(e.target.value));
            }}
            className="relative w-full accent-teal"
          />
        </div>
        <span className="w-14 text-right text-[11px] font-mono text-muted-foreground">48 h</span>
      </div>

      {/* Provenance */}
      <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
        <span className="font-mono uppercase tracking-widest">Data</span>
        <span>
          {liveCount}/10 sections live · via {via === "backend" ? "backend API" : "browser"}
          {pending ? ` · loading ${pending}…` : ""}
        </span>
        {Object.entries(status).map(([k, v]) => (
          <span
            key={k}
            title={v}
            className={`rounded-full px-1.5 py-0.5 ${v === "ok" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : v === "failed" ? "bg-violet-500/10 text-violet-700 dark:text-violet-300" : "bg-foreground/5 animate-pulse"}`}
          >
            {SOURCE_LABELS[k] ?? k}
            {v === "failed" ? " → synthetic" : ""}
          </span>
        ))}
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0">
          {[
            ["overview", "Overview"],
            ["now", "Now"],
            ["forecast", "Forecast"],
            ["storms", "Storms"],
            ["climate", "Climate"],
            ["future", "Future"],
            ["air", "Air & Water"],
            ["alerts", `Alerts${alerts.length ? ` (${alerts.length})` : ""}`],
          ].map(([v, l]) => (
            <TabsTrigger
              key={v}
              value={v}
              className="rounded-full px-3 py-1 text-xs data-[state=active]:glass-btn data-[state=active]:shadow-glow"
            >
              {l}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="mt-4">
          <TabsContent value="overview">
            <OverviewTab p={p} alerts={alerts} />
          </TabsContent>
          <TabsContent value="now">
            <NowTab p={p} i0={i0} diag={diags[0]} />
          </TabsContent>
          <TabsContent value="forecast">
            <ForecastTab p={p} i0={i0} />
          </TabsContent>
          <TabsContent value="storms">
            <StormsTab p={p} i0={i0} diags={diags} />
          </TabsContent>
          <TabsContent value="climate">
            <ClimateTab p={p} />
          </TabsContent>
          <TabsContent value="future">
            <FutureTab p={p} />
          </TabsContent>
          <TabsContent value="air">
            <AirWaterTab p={p} i0={i0} />
          </TabsContent>
          <TabsContent value="alerts">
            <AlertsTab
              alerts={[...alerts].sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level])}
            />
          </TabsContent>
        </div>
      </Tabs>
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        <SourceTag src="synthetic" className="mr-1" /> values come from a built-in climate model for
        India and fill any gaps live sources leave. Alerts marked "simulated" are not official —
        always follow IMD and NDMA warnings.
      </p>
    </div>
  );
}
