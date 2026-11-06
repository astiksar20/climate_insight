/**
 * Bharat Climate Twin — backend API.
 *
 * Aggregates, cleans and fuses every open dataset server-side (one cache for all
 * users, so upstream quotas are shared instead of spent per browser) and serves:
 *
 *   GET /api/health
 *   GET /api/profile?lat=..&lon=..[&projections=0]   NDJSON stream: {profile,status,final} lines
 *   GET /api/summary?lat=..&lon=..                   final profile + characteristics + alerts (JSON)
 *   GET /api/hotspots[?force=1]                      India-wide 12-hour hazard scan (JSON)
 *
 * The climate engine is shared with the frontend (frontend/src/lib/climate), so
 * browser fallback and server produce identical results.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { loadProfile } from "../../frontend/src/lib/climate/profile.ts";
import { scanIndia } from "../../frontend/src/lib/climate/hotspots.ts";
import { characteristics, computeAlerts } from "../../frontend/src/lib/climate/analysis.ts";
import { inIndiaBox } from "../../frontend/src/lib/climate/geo.ts";
import type { ClimateProfile } from "../../frontend/src/lib/climate/types.ts";

const PORT = Number(process.env.PORT ?? 8787);
const PROFILE_TTL = 15 * 60_000;
const FAST_SOURCES = ["geocode", "elevation", "forecast", "recent", "air", "flood", "marine", "power"];

type Status = Record<string, "pending" | "ok" | "failed">;
type Snapshot = { profile: ClimateProfile; status: Status; final: boolean };

/* ---------- profile cache: completed results + in-flight loads shared between requests ---------- */
type Entry = { t: number; latest?: Snapshot; done: boolean; listeners: Set<(s: Snapshot) => void> };
const profiles = new Map<string, Entry>();

function keyOf(lat: number, lon: number, proj: boolean) {
  return `${lat.toFixed(3)},${lon.toFixed(3)},${proj ? 1 : 0}`;
}

function startLoad(lat: number, lon: number, proj: boolean): Entry {
  const key = keyOf(lat, lon, proj);
  const hit = profiles.get(key);
  if (hit && (!hit.done || Date.now() - hit.t < PROFILE_TTL)) return hit;
  const e: Entry = { t: Date.now(), done: false, listeners: new Set() };
  profiles.set(key, e);
  let stage = 0; // 0 nothing sent · 1 synthetic baseline sent · 2 fast tier sent
  let guard: ReturnType<typeof setTimeout> | undefined;
  const finish = (s: Snapshot) => {
    if (e.done) return;
    e.latest = s; e.done = true; e.t = Date.now(); clearTimeout(guard);
    e.listeners.forEach((l) => l(s)); e.listeners.clear();
  };
  // never hold a client longer than 75 s — whatever we have by then (synthetic-filled) is final
  guard = setTimeout(() => e.latest && finish({ ...e.latest, final: true }), 75_000);
  loadProfile(lat, lon, (profile, status) => {
    if (e.done) return;
    const allDone = Object.values(status).every((v) => v !== "pending");
    const fastDone = FAST_SOURCES.every((k) => status[k] !== "pending");
    const snap: Snapshot = { profile, status, final: allDone };
    e.latest = snap;
    if (allDone) return finish(snap);
    // stream three updates: synthetic baseline → fast tier (forecast, air, flood…) → final (ERA5, CMIP6)
    if (stage === 0 || (stage === 1 && fastDone)) {
      stage = fastDone ? 2 : 1;
      e.listeners.forEach((l) => l(snap));
    }
  }, { projections: proj });
  return e;
}

function waitFinal(e: Entry): Promise<Snapshot> {
  if (e.done && e.latest) return Promise.resolve(e.latest);
  return new Promise((res) => {
    const l = (s: Snapshot) => { if (s.final) { e.listeners.delete(l); res(s); } };
    e.listeners.add(l);
  });
}

/* ---------- HTTP ---------- */
function send(res: ServerResponse, code: number, body: unknown) {
  res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

function parseLoc(url: URL): { lat: number; lon: number } | string {
  const lat = Number(url.searchParams.get("lat")), lon = Number(url.searchParams.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "lat and lon are required numbers";
  if (!inIndiaBox(lat, lon)) return "location must be within India (6–37.6°N, 67.5–97.8°E)";
  return { lat: Math.round(lat * 1000) / 1000, lon: Math.round(lon * 1000) / 1000 };
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (req.method === "OPTIONS") { res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-methods": "GET", "access-control-allow-headers": "*" }); return res.end(); }
  if (req.method !== "GET") return send(res, 405, { error: "GET only" });

  switch (url.pathname) {
    case "/api/health":
      return send(res, 200, { ok: true, service: "bharat-climate-twin-backend", cachedProfiles: profiles.size, time: new Date().toISOString() });

    case "/api/profile": {
      const loc = parseLoc(url);
      if (typeof loc === "string") return send(res, 400, { error: loc });
      const e = startLoad(loc.lat, loc.lon, url.searchParams.get("projections") !== "0");
      res.writeHead(200, { "content-type": "application/x-ndjson", "access-control-allow-origin": "*", "cache-control": "no-store", "x-accel-buffering": "no" });
      const write = (s: Snapshot) => res.write(JSON.stringify(s) + "\n");
      if (e.latest) write(e.latest);
      if (e.done) return res.end();
      const l = (s: Snapshot) => { write(s); if (s.final) { e.listeners.delete(l); res.end(); } };
      e.listeners.add(l);
      req.on("close", () => e.listeners.delete(l));
      return;
    }

    case "/api/summary": {
      const loc = parseLoc(url);
      if (typeof loc === "string") return send(res, 400, { error: loc });
      const s = await waitFinal(startLoad(loc.lat, loc.lon, url.searchParams.get("projections") !== "0"));
      return send(res, 200, { ...s, characteristics: characteristics(s.profile), alerts: computeAlerts(s.profile) });
    }

    case "/api/hotspots": {
      const hs = await scanIndia(url.searchParams.get("force") === "1");
      return send(res, 200, { updated: new Date().toISOString(), hotspots: hs });
    }

    default:
      return send(res, 404, { error: "not found", endpoints: ["/api/health", "/api/profile", "/api/summary", "/api/hotspots"] });
  }
}

// evict stale cache entries every 10 minutes
setInterval(() => {
  for (const [k, e] of profiles) if (e.done && Date.now() - e.t > PROFILE_TTL) profiles.delete(k);
}, 10 * 60_000).unref();

createServer((req, res) => {
  handle(req, res).catch((err) => { console.error(err); if (!res.headersSent) send(res, 500, { error: String(err?.message ?? err) }); else res.end(); });
}).listen(PORT, () => console.log(`Bharat Climate Twin backend on http://localhost:${PORT}`));
