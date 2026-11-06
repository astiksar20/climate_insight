/* eslint-disable @typescript-eslint/no-explicit-any -- parses untyped upstream API JSON */
import { useEffect, useState } from "react";
import { loadProfile, syntheticProfile } from "./profile";
import { scanIndia, type Hotspot } from "./hotspots";
import type { ClimateProfile } from "./types";

export type LoadStatus = Record<string, "pending" | "ok" | "failed">;

/**
 * Backend first: the API in /backend aggregates + caches server-side.
 * VITE_API_URL points at it (default: same origin, proxied to :8787 by `vite dev`).
 * If the backend isn't reachable, everything runs in the browser instead.
 */
const API =
  ((import.meta as any).env?.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";
let backend: Promise<boolean> | null = null;
export function backendAvailable(): Promise<boolean> {
  if (!backend) {
    backend = (async () => {
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 2000);
        const r = await fetch(`${API}/api/health`, { signal: ctl.signal });
        clearTimeout(t);
        return r.ok && (await r.json())?.ok === true;
      } catch {
        return false;
      }
    })();
  }
  return backend;
}

async function streamProfile(
  lat: number,
  lon: number,
  onSnap: (p: ClimateProfile, s: LoadStatus) => void,
  signal: AbortSignal,
) {
  const res = await fetch(`${API}/api/profile?lat=${lat}&lon=${lon}`, { signal });
  if (!res.ok || !res.body) throw new Error(`backend ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "",
    got = false;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (!line.trim()) continue;
      const snap = JSON.parse(line);
      got = true;
      onSnap(snap.profile, snap.status);
    }
  }
  if (!got) throw new Error("empty backend stream");
}

export function useClimateProfile(loc: { lat: number; lon: number } | null) {
  const [profile, setProfile] = useState<ClimateProfile | null>(null);
  const [status, setStatus] = useState<LoadStatus>({});
  const [via, setVia] = useState<"backend" | "browser">("browser");
  useEffect(() => {
    if (!loc) return;
    setProfile(syntheticProfile(loc.lat, loc.lon));
    const ctl = new AbortController();
    let cancelBrowser: (() => void) | undefined;
    const update = (p: ClimateProfile, s: LoadStatus) => {
      if (!ctl.signal.aborted) {
        setProfile(p);
        setStatus(s);
      }
    };
    const browser = () => {
      if (!ctl.signal.aborted) {
        setVia("browser");
        cancelBrowser = loadProfile(loc.lat, loc.lon, update);
      }
    };
    backendAvailable().then((ok) => {
      if (ctl.signal.aborted) return;
      if (!ok) return browser();
      setVia("backend");
      streamProfile(loc.lat, loc.lon, update, ctl.signal).catch(() => {
        if (!ctl.signal.aborted) browser();
      });
    });
    return () => {
      ctl.abort();
      cancelBrowser?.();
    };
  }, [loc?.lat, loc?.lon]);
  return { profile, status, via };
}

export function useHotspots(refreshMs = 15 * 60000) {
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = (force = false) => {
    setLoading(true);
    backendAvailable()
      .then(async (ok) => {
        if (ok) {
          try {
            const r = await fetch(`${API}/api/hotspots${force ? "?force=1" : ""}`);
            if (r.ok) return (await r.json()).hotspots as Hotspot[];
          } catch {
            /* fall through */
          }
        }
        return scanIndia(force);
      })
      .then((h) => {
        setHotspots(h);
        setUpdated(new Date());
      })
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    refresh();
    const id = setInterval(() => refresh(true), refreshMs);
    return () => clearInterval(id);
  }, [refreshMs]);
  return { hotspots, updated, loading, refresh };
}
