import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { FeatureShell } from "../components/FeatureShell";
import { useHotspots } from "@/lib/climate/useClimate";
import { LEVEL_LABEL, LEVEL_RANK, type Level } from "@/lib/climate/analysis";
import { hazardSvg, LEVEL_COLOR } from "../components/climate/hazardIcons";
import { LevelPill, SourceTag } from "../components/climate/ui";
import { RefreshCw } from "lucide-react";

export const Route = createFileRoute("/dashboard/risk-alerts")({
  head: () => ({ meta: [{ title: "Risk Alerts — Bharat Climate Twin" }] }),
  component: RiskAlerts,
});

const HAZARD_NAME: Record<string, string> = {
  tornado: "Tornado potential",
  thunder: "Thunderstorm & lightning",
  hail: "Hailstorm",
  rain: "Heavy rain",
  wind: "Squall / strong wind",
  heat: "Heat",
  cold: "Cold",
  fog: "Dense fog",
  smog: "Air pollution",
  snow: "Snowfall",
  calm: "Calm",
};

function RiskAlerts() {
  const { hotspots, updated, loading, refresh } = useHotspots();
  const [minLevel, setMinLevel] = useState<Level>("yellow");
  const list = useMemo(
    () =>
      hotspots
        .filter((h) => LEVEL_RANK[h.level] >= LEVEL_RANK[minLevel] && h.kind !== "calm")
        .sort(
          (a, b) =>
            LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || b.peak.stormScore - a.peak.stormScore,
        ),
    [hotspots, minLevel],
  );
  const live = hotspots.filter((h) => h.source !== "synthetic").length;

  return (
    <FeatureShell
      eyebrow="Risk Alerts"
      title="What we're watching right now"
      description="An automatic scan of 81 stations across every state and UT for the next 12 hours: storms building up, tornado ingredients, heavy rain, squalls, heat, cold, fog and smog."
    >
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {(["yellow", "orange", "red"] as Level[]).map((l) => (
          <button
            key={l}
            onClick={() => setMinLevel(l)}
            className={`rounded-full px-3 py-1.5 text-xs ${minLevel === l ? "glass-btn shadow-glow" : "text-muted-foreground"}`}
          >
            {l === "yellow" ? "All warnings" : l === "orange" ? "Orange & red" : "Red only"}
          </button>
        ))}
        <span className="ml-auto text-[11px] font-mono text-muted-foreground">
          {updated
            ? `Updated ${updated.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`
            : "Scanning…"}{" "}
          · {live}/{hotspots.length} stations live
        </span>
        <button
          onClick={() => refresh(true)}
          className="inline-flex items-center gap-1.5 rounded-full glass-btn px-3 py-1.5 text-xs"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Rescan
        </button>
      </div>
      <div className="space-y-3">
        {!loading && list.length === 0 && (
          <p className="rounded-3xl glass-strong p-6 text-sm text-muted-foreground">
            No warnings at this level right now.
          </p>
        )}
        {list.map((h) => (
          <div
            key={h.city.name}
            className="group relative flex items-start gap-4 overflow-hidden rounded-3xl glass-strong p-5 transition-all hover:-translate-y-0.5 hover:shadow-elevated"
          >
            <div
              className="absolute left-0 top-0 h-full w-1"
              style={{ background: LEVEL_COLOR[h.level] }}
            />
            <div
              className={`hz-marker hz-${h.level} ${h.building ? "hz-building" : ""} shrink-0`}
              style={{ width: 48, height: 48, ["--hz" as string]: LEVEL_COLOR[h.level] }}
              dangerouslySetInnerHTML={{ __html: hazardSvg(h.kind, h.level) }}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <LevelPill level={h.level}>
                  {h.level} · {LEVEL_LABEL[h.level]}
                </LevelPill>
                <h3 className="font-display text-base font-semibold">
                  {h.city.name} ·{" "}
                  <span className="font-normal text-muted-foreground">{h.city.state}</span>
                </h3>
                <SourceTag src={h.source} />
              </div>
              <p className="mt-1.5 text-sm">
                <b>{HAZARD_NAME[h.kind]}:</b> {h.label}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Now {Math.round(h.temp)}°C, feels {Math.round(h.feels)}°C · wind{" "}
                {Math.round(h.wind)} km/h (gust {Math.round(h.gust)}) · AQI {h.aqi} {h.aqiCat}
                {h.building && (
                  <span className="text-orange-500">
                    {" "}
                    · ▲ storm building, peak in {h.hoursToPeak} h ({h.peak.stage.toLowerCase()})
                  </span>
                )}
              </p>
            </div>
            <Link
              to="/dashboard/live-map"
              className="hidden shrink-0 rounded-full glass-btn px-3 py-1.5 text-xs sm:block"
            >
              Open map
            </Link>
          </div>
        ))}
      </div>
      <p className="mt-6 text-xs text-muted-foreground">
        Computed from Open-Meteo NWP and CAMS data, with synthetic fill where a station's data is
        missing. These are not official warnings; follow IMD and NDMA advisories.
      </p>
    </FeatureShell>
  );
}
