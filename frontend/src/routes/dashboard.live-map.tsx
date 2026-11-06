import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { FeatureShell } from "../components/FeatureShell";
import { ClimateMap, type MapLayers } from "../components/climate/ClimateMap";
import { LocationPanel } from "../components/climate/LocationPanel";
import { useClimateProfile, useHotspots } from "@/lib/climate/useClimate";
import { CITIES } from "@/lib/climate/geo";
import { LEVEL_COLOR } from "../components/climate/hazardIcons";
import { LEVEL_RANK } from "@/lib/climate/analysis";
import { CloudLightning, Layers, MapPin, Radar, RefreshCw, Wind, Zap } from "lucide-react";
import { toast, Toaster } from "sonner";

export const Route = createFileRoute("/dashboard/live-map")({
  head: () => ({ meta: [{ title: "Live Climate Map — Bharat Climate Twin" }] }),
  component: LiveMap,
});

const LAYER_DEFS: { id: keyof MapLayers; label: string; icon: typeof Radar }[] = [
  { id: "hotspots", label: "Hazard hotspots", icon: CloudLightning },
  { id: "radar", label: "Rain radar loop", icon: Radar },
  { id: "wind", label: "Wind flow", icon: Wind },
  { id: "lightning", label: "Lightning", icon: Zap },
];

function LiveMap() {
  const [sel, setSel] = useState<{ lat: number; lon: number }>({ lat: 28.61, lon: 77.21 });
  const [layers, setLayers] = useState<MapLayers>({
    hotspots: true,
    radar: true,
    wind: true,
    lightning: true,
  });
  const { profile, status, via } = useClimateProfile(sel);
  const { hotspots, updated, loading, refresh } = useHotspots();

  const ranked = useMemo(
    () =>
      [...hotspots]
        .filter((h) => h.kind !== "calm")
        .sort(
          (a, b) =>
            LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || b.peak.stormScore - a.peak.stormScore,
        )
        .slice(0, 8),
    [hotspots],
  );
  const nearest = useMemo(
    () =>
      hotspots.find(
        (h) => Math.abs(h.city.lat - sel.lat) < 0.05 && Math.abs(h.city.lon - sel.lon) < 0.05,
      ),
    [hotspots, sel],
  );
  const counts = useMemo(
    () => ({
      red: hotspots.filter((h) => h.level === "red").length,
      orange: hotspots.filter((h) => h.level === "orange").length,
      yellow: hotspots.filter((h) => h.level === "yellow").length,
      building: hotspots.filter((h) => h.building).length,
    }),
    [hotspots],
  );

  return (
    <FeatureShell
      eyebrow="Live Layer"
      title="Live Climate Map"
      description="Tap anywhere in India. You get current conditions, forecasts, storm build-up, 35 years of climate history, projections to 2050 and alerts, all combined from open datasets."
    >
      <Toaster position="top-center" richColors />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="mr-1 inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
          <Layers className="h-3.5 w-3.5" /> Layers
        </span>
        {LAYER_DEFS.map((l) => (
          <button
            key={l.id}
            onClick={() => setLayers((s) => ({ ...s, [l.id]: !s[l.id] }))}
            aria-pressed={layers[l.id]}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${layers[l.id] ? "glass-btn text-foreground shadow-glow" : "text-muted-foreground hover:bg-foreground/5"}`}
          >
            <l.icon className={`h-3.5 w-3.5 ${layers[l.id] ? "text-teal" : ""}`} /> {l.label}
          </button>
        ))}
        <select
          aria-label="Jump to city"
          className="ml-auto rounded-full glass px-3 py-1.5 text-xs"
          value=""
          onChange={(e) => {
            const c = CITIES[Number(e.target.value)];
            if (c) setSel({ lat: c.lat, lon: c.lon });
          }}
        >
          <option value="">Jump to a city…</option>
          {CITIES.map((c, i) => (
            <option key={c.name} value={i}>
              {c.name}, {c.state}
            </option>
          ))}
        </select>
        <button
          onClick={() => refresh(true)}
          className="inline-flex items-center gap-1.5 rounded-full glass-btn px-3 py-1.5 text-xs"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Rescan India
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_480px]">
        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <div className="relative h-[560px] lg:h-[640px] overflow-hidden rounded-3xl glass-strong">
            <ClimateMap
              hotspots={hotspots}
              selected={sel}
              selectedHazard={nearest ? { kind: nearest.kind, level: nearest.level } : null}
              layers={layers}
              onSelect={(lat, lon) => setSel({ lat, lon })}
              onOutside={() => toast("That spot is outside India — pick a location within India.")}
            />
            <div className="pointer-events-none absolute left-4 top-4 z-[500] space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full glass px-3 py-1.5 text-[11px] font-mono uppercase tracking-widest">
                <MapPin className="h-3 w-3 text-teal" /> {sel.lat.toFixed(2)}°N {sel.lon.toFixed(2)}
                °E
              </div>
              <div className="flex flex-wrap gap-1.5 text-[10px] font-mono">
                {(["red", "orange", "yellow"] as const).map((l) => (
                  <span
                    key={l}
                    className="inline-flex items-center gap-1 rounded-full glass px-2 py-1"
                  >
                    <span className="h-2 w-2 rounded-full" style={{ background: LEVEL_COLOR[l] }} />
                    {counts[l]} {l}
                  </span>
                ))}
                {counts.building > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full glass px-2 py-1 text-orange-500">
                    ▲ {counts.building} building
                  </span>
                )}
              </div>
            </div>
            <div className="absolute bottom-4 right-14 z-[500] rounded-full glass px-3 py-1.5 text-[10px] font-mono text-muted-foreground">
              {updated
                ? `Scan ${updated.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`
                : "Scanning…"}{" "}
              · {hotspots.length} stations
            </div>
          </div>

          <div className="rounded-3xl glass-strong p-5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
                India hotspots · next 12 h
              </p>
              <p className="text-[10px] text-muted-foreground">Tap one to open it</p>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {ranked.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {loading ? "Scanning 80 stations…" : "No significant hazards right now."}
                </p>
              )}
              {ranked.map((h) => (
                <button
                  key={h.city.name}
                  onClick={() => setSel({ lat: h.city.lat, lon: h.city.lon })}
                  className="flex items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors hover:bg-foreground/5"
                >
                  <span
                    className="h-8 w-1.5 rounded-full"
                    style={{ background: LEVEL_COLOR[h.level] }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {h.city.name}{" "}
                      <span className="font-normal text-muted-foreground">· {h.city.state}</span>
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {h.label}
                      {h.building ? ` · ▲ peak in ${h.hoursToPeak} h` : ""}
                    </span>
                  </span>
                  <span className="text-sm font-mono">{Math.round(h.temp)}°</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="min-w-0">
          {profile && <LocationPanel profile={profile} status={status} via={via} />}
        </div>
      </div>
    </FeatureShell>
  );
}
