/* eslint-disable @typescript-eslint/no-explicit-any -- parses untyped upstream API JSON */
import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Hotspot } from "@/lib/climate/hotspots";
import { INDIA_BOUNDS, inIndiaBox } from "@/lib/climate/geo";
import { hazardSvg, LEVEL_COLOR } from "./hazardIcons";
import type { Level } from "@/lib/climate/analysis";
import { Pause, Play, Radar } from "lucide-react";

export type MapLayers = { radar: boolean; wind: boolean; hotspots: boolean; lightning: boolean };

type Props = {
  hotspots: Hotspot[];
  selected: { lat: number; lon: number } | null;
  selectedHazard?: { kind: Hotspot["kind"]; level: Level } | null;
  layers: MapLayers;
  onSelect: (lat: number, lon: number) => void;
  onOutside?: () => void;
};

export function ClimateMap({
  hotspots,
  selected,
  selectedHazard,
  layers,
  onSelect,
  onOutside,
}: Props) {
  const el = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const LRef = useRef<typeof Leaflet | null>(null);
  const hotLayer = useRef<Leaflet.LayerGroup | null>(null);
  const selLayer = useRef<Leaflet.LayerGroup | null>(null);
  const radarFrames = useRef<{ time: number; layer: Leaflet.TileLayer }[]>([]);
  const [ready, setReady] = useState(false);
  const [radarIdx, setRadarIdx] = useState(0);
  const [radarPlaying, setRadarPlaying] = useState(true);
  const [radarStatus, setRadarStatus] = useState<"loading" | "ok" | "off">("loading");
  const cb = useRef({ onSelect, onOutside });
  cb.current = { onSelect, onOutside };

  // init map (client only)
  useEffect(() => {
    let disposed = false;
    import("leaflet").then((mod) => {
      const L = (mod as any).default ?? mod;
      if (disposed || !el.current || mapRef.current) return;
      LRef.current = L;
      const map = L.map(el.current, {
        zoomControl: false,
        minZoom: 4,
        maxZoom: 12,
        worldCopyJump: false,
        attributionControl: true,
        preferCanvas: true,
      });
      map.fitBounds(INDIA_BOUNDS as any, { padding: [10, 10] });
      L.control.zoom({ position: "bottomright" }).addTo(map);
      const dark = document.documentElement.classList.contains("dark");
      const base = L.tileLayer(
        `https://{s}.basemaps.cartocdn.com/${dark ? "dark_all" : "rastertiles/voyager"}/{z}/{x}/{y}{r}.png`,
        {
          subdomains: "abcd",
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a> · Data: Open-Meteo, NASA POWER, RainViewer',
        },
      ).addTo(map);
      const obs = new MutationObserver(() => {
        const d = document.documentElement.classList.contains("dark");
        base.setUrl(
          `https://{s}.basemaps.cartocdn.com/${d ? "dark_all" : "rastertiles/voyager"}/{z}/{x}/{y}{r}.png`,
        );
      });
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      hotLayer.current = L.layerGroup().addTo(map);
      selLayer.current = L.layerGroup().addTo(map);
      map.on("click", (e: Leaflet.LeafletMouseEvent) => {
        const { lat, lng } = e.latlng;
        if (!inIndiaBox(lat, lng)) {
          cb.current.onOutside?.();
          return;
        }
        cb.current.onSelect(Math.round(lat * 1000) / 1000, Math.round(lng * 1000) / 1000);
      });
      mapRef.current = map;
      (map as any)._bctObs = obs;
      setReady(true);
    });
    return () => {
      disposed = true;
      const m = mapRef.current as any;
      m?._bctObs?.disconnect();
      m?.remove();
      mapRef.current = null;
    };
  }, []);

  // hotspot markers
  useEffect(() => {
    const L = LRef.current,
      g = hotLayer.current;
    if (!ready || !L || !g) return;
    g.clearLayers();
    if (!layers.hotspots) return;
    for (const h of hotspots) {
      const size = h.kind === "calm" ? 14 : h.level === "red" ? 44 : h.level === "orange" ? 38 : 32;
      const icon = L.divIcon({
        className: "",
        html: `<div class="hz-marker hz-${h.level} ${h.building ? "hz-building" : ""}" style="width:${size}px;height:${size}px;--hz:${LEVEL_COLOR[h.level]}">${hazardSvg(h.kind, h.level)}</div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });
      const m = L.marker([h.city.lat, h.city.lon], {
        icon,
        riseOnHover: true,
        zIndexOffset: h.level === "red" ? 1000 : h.level === "orange" ? 500 : 0,
      });
      m.bindTooltip(
        `<div class="hz-tip"><b>${h.city.name}</b> · ${h.city.state}<br/>${Math.round(h.temp)}°C · ${h.label}${h.building ? `<br/><span style="color:${LEVEL_COLOR.orange}">▲ Storm building — peak in ${h.hoursToPeak} h</span>` : ""}<br/><span class="hz-src">${h.source === "live" ? "Live" : h.source === "mixed" ? "Live + synthetic" : "Synthetic"}</span></div>`,
        { direction: "top", offset: [0, -size / 2] },
      );
      m.on("click", () => cb.current.onSelect(h.city.lat, h.city.lon));
      m.addTo(g);
    }
  }, [ready, hotspots, layers.hotspots]);

  // selected location marker
  useEffect(() => {
    const L = LRef.current,
      g = selLayer.current,
      map = mapRef.current;
    if (!ready || !L || !g || !map) return;
    g.clearLayers();
    if (!selected) return;
    const hz =
      selectedHazard && selectedHazard.kind !== "calm"
        ? hazardSvg(selectedHazard.kind, selectedHazard.level)
        : "";
    const icon = L.divIcon({
      className: "",
      html: `<div class="sel-marker"><span class="sel-ring"></span><span class="sel-ring d2"></span><span class="sel-dot"></span>${hz ? `<div class="sel-hz">${hz}</div>` : ""}</div>`,
      iconSize: [60, 60],
      iconAnchor: [30, 30],
    });
    L.marker([selected.lat, selected.lon], { icon, interactive: false, zIndexOffset: 2000 }).addTo(
      g,
    );
    if (!map.getBounds().pad(-0.15).contains([selected.lat, selected.lon]))
      map.panTo([selected.lat, selected.lon]);
  }, [ready, selected?.lat, selected?.lon, selectedHazard?.kind, selectedHazard?.level]);

  // radar (RainViewer): load frames
  useEffect(() => {
    const L = LRef.current,
      map = mapRef.current;
    if (!ready || !L || !map) return;
    radarFrames.current.forEach((f) => map.removeLayer(f.layer));
    radarFrames.current = [];
    if (!layers.radar) {
      setRadarStatus("off");
      return;
    }
    let stop = false;
    setRadarStatus("loading");
    fetch("https://api.rainviewer.com/public/weather-maps.json")
      .then((r) => r.json())
      .then((j) => {
        if (stop) return;
        const frames = [...(j?.radar?.past ?? []), ...(j?.radar?.nowcast ?? [])];
        radarFrames.current = frames.map((f: { time: number; path: string }) => ({
          time: f.time,
          layer: L.tileLayer(`${j.host}${f.path}/256/{z}/{x}/{y}/4/1_1.png`, {
            opacity: 0,
            maxNativeZoom: 7,
            maxZoom: 12,
            zIndex: 300,
          }).addTo(map),
        }));
        setRadarIdx(Math.max(0, (j?.radar?.past?.length ?? 1) - 1));
        setRadarStatus(frames.length ? "ok" : "off");
      })
      .catch(() => setRadarStatus("off"));
    return () => {
      stop = true;
    };
  }, [ready, layers.radar]);

  useEffect(() => {
    const fr = radarFrames.current;
    fr.forEach((f, i) => f.layer.setOpacity(i === radarIdx ? 0.65 : 0));
    if (!radarPlaying || !fr.length) return;
    const t = setTimeout(
      () => setRadarIdx((i) => (i + 1) % fr.length),
      i_delay(radarIdx, fr.length),
    );
    return () => clearTimeout(t);
  }, [radarIdx, radarPlaying, radarStatus]);

  // wind particles + lightning on canvas
  useEffect(() => {
    const map = mapRef.current,
      cv = canvasRef.current;
    if (!ready || !map || !cv) return;
    const ctx = cv.getContext("2d")!;
    let raf = 0;
    let field: {
      cols: number;
      rows: number;
      step: number;
      u: Float32Array;
      v: Float32Array;
      speed: Float32Array;
    } | null = null;
    const pts = hotspots.map((h) => {
      const r = (h.windDir * Math.PI) / 180,
        s = h.wind;
      return { lat: h.city.lat, lon: h.city.lon, u: -s * Math.sin(r), v: -s * Math.cos(r), h };
    });
    const resize = () => {
      const s = map.getSize();
      const dpr = window.devicePixelRatio || 1;
      cv.width = s.x * dpr;
      cv.height = s.y * dpr;
      cv.style.width = s.x + "px";
      cv.style.height = s.y + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildField();
    };
    const buildField = () => {
      if (!pts.length) {
        field = null;
        return;
      }
      const s = map.getSize(),
        step = 24;
      const cols = Math.ceil(s.x / step) + 1,
        rows = Math.ceil(s.y / step) + 1;
      const u = new Float32Array(cols * rows),
        v = new Float32Array(cols * rows),
        speed = new Float32Array(cols * rows);
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          const ll = map.containerPointToLatLng([c * step, r * step] as any);
          let wu = 0,
            wv = 0,
            ws = 0,
            near = Infinity;
          for (const p of pts) {
            const d2 = (p.lat - ll.lat) ** 2 + (p.lon - ll.lng) ** 2;
            near = Math.min(near, d2);
            const w = 1 / (d2 + 0.5) ** 1.5;
            wu += w * p.u;
            wv += w * p.v;
            ws += w;
          }
          const k = r * cols + c;
          const fade = near > 16 ? 0 : 1; // only draw within ~4° of a station
          u[k] = (wu / ws) * fade;
          v[k] = (wv / ws) * fade;
          speed[k] = Math.hypot(u[k], v[k]);
        }
      field = { cols, rows, step, u, v, speed };
    };
    const sample = (x: number, y: number) => {
      if (!field) return [0, 0, 0];
      const c = Math.min(field.cols - 1, Math.max(0, Math.round(x / field.step))),
        r = Math.min(field.rows - 1, Math.max(0, Math.round(y / field.step)));
      const k = r * field.cols + c;
      return [field.u[k], field.v[k], field.speed[k]];
    };
    const N = 1400;
    const parts = Array.from({ length: N }, () => ({ x: 0, y: 0, age: 0 }));
    const respawn = (p: { x: number; y: number; age: number }) => {
      const s = map.getSize();
      p.x = Math.random() * s.x;
      p.y = Math.random() * s.y;
      p.age = Math.random() * 80;
    };
    parts.forEach(respawn);
    const stormPts = hotspots.filter(
      (h) =>
        h.kind === "thunder" ||
        h.kind === "hail" ||
        h.kind === "tornado" ||
        h.peak.thunderProb >= 45,
    );
    const flashes: { x: number; y: number; t: number; seg: [number, number][] }[] = [];
    const onMove = () => {
      ctx.clearRect(0, 0, cv.width, cv.height);
      buildField();
    };
    map.on("moveend zoomend resize", onMove);
    map.on("resize", resize);
    resize();
    const tick = () => {
      const s = map.getSize();
      // fade previous frame for trails
      ctx.globalCompositeOperation = "destination-in";
      ctx.fillStyle = "rgba(0,0,0,0.92)";
      ctx.fillRect(0, 0, s.x, s.y);
      ctx.globalCompositeOperation = "source-over";
      if (layers.wind) {
        ctx.lineWidth = 1.2;
        for (const p of parts) {
          const [u, v, sp] = sample(p.x, p.y);
          if (sp < 0.5 || p.age > 90) {
            respawn(p);
            continue;
          }
          const k = 0.09;
          const nx = p.x + u * k,
            ny = p.y - v * k;
          ctx.strokeStyle =
            sp > 30
              ? "rgba(249,115,22,0.85)"
              : sp > 15
                ? "rgba(56,189,248,0.8)"
                : "rgba(148,163,184,0.6)";
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(nx, ny);
          ctx.stroke();
          p.x = nx;
          p.y = ny;
          p.age++;
          if (p.x < 0 || p.y < 0 || p.x > s.x || p.y > s.y) respawn(p);
        }
      }
      if (layers.lightning && stormPts.length) {
        for (const h of stormPts) {
          if (Math.random() < 0.006 + h.peak.thunderProb / 6000) {
            const pt = map.latLngToContainerPoint([
              h.city.lat + (Math.random() - 0.5) * 0.6,
              h.city.lon + (Math.random() - 0.5) * 0.6,
            ]);
            const seg: [number, number][] = [[pt.x, pt.y - 26]];
            for (let i = 0; i < 5; i++)
              seg.push([seg[i][0] + (Math.random() - 0.5) * 12, seg[i][1] + 8]);
            flashes.push({ x: pt.x, y: pt.y, t: 0, seg });
          }
        }
        for (let i = flashes.length - 1; i >= 0; i--) {
          const f = flashes[i];
          const a = 1 - f.t / 10;
          const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, 34);
          g.addColorStop(0, `rgba(254,240,138,${0.55 * a})`);
          g.addColorStop(1, "rgba(254,240,138,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(f.x, f.y, 34, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = `rgba(255,255,255,${a})`;
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          f.seg.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
          ctx.stroke();
          if (++f.t > 10) flashes.splice(i, 1);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      map.off("moveend zoomend resize", onMove);
      map.off("resize", resize);
      ctx.clearRect(0, 0, cv.width, cv.height);
    };
  }, [ready, hotspots, layers.wind, layers.lightning]);

  const frame = radarFrames.current[radarIdx];
  return (
    <div className="relative h-full w-full overflow-hidden rounded-3xl">
      <div ref={el} className="absolute inset-0 z-0 bg-[#d9e3ea] dark:bg-[#11181f]" />
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-[450]" />
      {layers.radar && (
        <div className="absolute bottom-4 left-4 z-[500] flex items-center gap-2 rounded-full glass px-3 py-1.5 text-[11px] font-mono">
          <Radar className="h-3.5 w-3.5 text-teal" />
          {radarStatus === "ok" && frame ? (
            <>
              <button
                aria-label={radarPlaying ? "Pause radar" : "Play radar"}
                onClick={() => setRadarPlaying((p) => !p)}
                className="grid h-5 w-5 place-items-center rounded-full bg-foreground/10"
              >
                {radarPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              </button>
              <span>
                Radar{" "}
                {new Date(frame.time * 1000).toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "Asia/Kolkata",
                })}{" "}
                IST{frame.time * 1000 > Date.now() ? " · nowcast" : ""}
              </span>
            </>
          ) : radarStatus === "loading" ? (
            <span>Loading radar…</span>
          ) : (
            <span>Radar unavailable — showing model storms</span>
          )}
        </div>
      )}
    </div>
  );
}

const i_delay = (i: number, n: number) => (i === n - 1 ? 1600 : 550);
