import { useEffect, useRef } from "react";

export type SkyState = {
  cloud: number;
  precip: number;
  thunderProb: number;
  tornadoIndex: number;
  wind: number;
  isDay: number;
  visibility: number;
  temp: number;
  snow: number;
  hail: boolean;
};

/**
 * Animated canvas rendering of the sky at the selected spot: clouds, rain/snow/hail,
 * lightning, a funnel cloud when the tornado index is high, fog and heat shimmer.
 */
export function SkyScene({ state, height = 220 }: { state: SkyState; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const sRef = useRef(state);
  sRef.current = state;

  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext("2d")!;
    let raf = 0,
      t = 0,
      flash = 0;
    const drops = Array.from({ length: 260 }, () => ({
      x: Math.random(),
      y: Math.random(),
      z: 0.5 + Math.random() * 0.5,
    }));
    const clouds = Array.from({ length: 9 }, (_, i) => ({
      x: Math.random(),
      y: 0.08 + Math.random() * 0.25,
      s: 0.6 + Math.random() * 0.8,
      k: i,
    }));
    let bolt: [number, number][] = [];
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = cv.clientWidth;
      cv.width = w * dpr;
      cv.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(cv);

    const draw = () => {
      const s = sRef.current;
      const W = cv.clientWidth,
        H = height;
      t += 1 / 60;
      const dark = s.cloud / 100;
      const storm = Math.min(1, s.thunderProb / 100 + s.precip / 15);
      // sky gradient
      const g = ctx.createLinearGradient(0, 0, 0, H);
      if (s.isDay) {
        g.addColorStop(0, mix("#3b82f6", "#475569", Math.max(dark * 0.7, storm)));
        g.addColorStop(1, mix("#bae6fd", "#94a3b8", Math.max(dark * 0.6, storm)));
      } else {
        g.addColorStop(0, mix("#0b1026", "#111827", dark));
        g.addColorStop(1, mix("#1e293b", "#334155", dark));
      }
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      if (flash > 0) {
        ctx.fillStyle = `rgba(255,255,240,${flash * 0.5})`;
        ctx.fillRect(0, 0, W, H);
      }
      // stars / sun / moon
      if (!s.isDay && s.cloud < 70) {
        ctx.fillStyle = "rgba(255,255,255,.8)";
        for (let i = 0; i < 40; i++) {
          const x = (i * 97.3) % W,
            y = (i * 53.1) % (H * 0.5);
          ctx.globalAlpha = (0.4 + 0.6 * Math.abs(Math.sin(t + i))) * (1 - s.cloud / 70);
          ctx.fillRect(x, y, 1.5, 1.5);
        }
        ctx.globalAlpha = 1;
      }
      const sunX = W * 0.8,
        sunY = H * 0.22;
      if (s.cloud < 95) {
        ctx.globalAlpha = 1 - s.cloud / 100;
        if (s.isDay) {
          const sg = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 46);
          sg.addColorStop(0, s.temp > 38 ? "#fde68a" : "#fef9c3");
          sg.addColorStop(0.35, s.temp > 38 ? "#f97316" : "#facc15");
          sg.addColorStop(1, "rgba(250,204,21,0)");
          ctx.fillStyle = sg;
          ctx.beginPath();
          ctx.arc(sunX, sunY, 46, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = "#e2e8f0";
          ctx.beginPath();
          ctx.arc(sunX, sunY, 13, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      // clouds (count & darkness follow cover / storminess), drift with wind
      const nClouds = Math.round((s.cloud / 100) * clouds.length);
      const tone = s.isDay ? mix("#ffffff", "#334155", storm) : mix("#64748b", "#1f2937", storm);
      for (let i = 0; i < nClouds; i++) {
        const c = clouds[i];
        c.x += (0.00004 + s.wind / 400000) * (1 + c.s);
        if (c.x > 1.25) c.x = -0.25;
        const cx = c.x * W,
          cy = c.y * H,
          r = 26 * c.s * (1 + storm * 0.6);
        ctx.fillStyle = tone;
        ctx.globalAlpha = 0.85;
        for (const [dx, dy, rr] of [
          [0, 0, 1],
          [r * 0.9, 4, 0.8],
          [-r * 0.9, 6, 0.75],
          [r * 0.4, -r * 0.45, 0.8],
          [-r * 0.3, -r * 0.35, 0.7],
        ] as const) {
          ctx.beginPath();
          ctx.arc(cx + dx, cy + dy, r * rr, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      // cumulonimbus anvil when thunder likely
      if (s.thunderProb > 35) {
        const a = Math.min(1, (s.thunderProb - 35) / 50);
        ctx.fillStyle = s.isDay ? `rgba(51,65,85,${0.75 * a})` : `rgba(15,23,42,${0.85 * a})`;
        ctx.beginPath();
        ctx.moveTo(W * 0.15, H * 0.42);
        ctx.quadraticCurveTo(W * 0.3, H * 0.05, W * 0.55, H * 0.08);
        ctx.quadraticCurveTo(W * 0.75, H * 0.02, W * 0.9, H * 0.14);
        ctx.quadraticCurveTo(W * 0.7, H * 0.2, W * 0.6, H * 0.45);
        ctx.closePath();
        ctx.fill();
      }
      // tornado funnel
      if (s.tornadoIndex >= 0.5) {
        const k = Math.min(1, s.tornadoIndex / 2);
        const baseX = W * 0.42 + Math.sin(t * 0.7) * 14,
          top = H * 0.36,
          bottom = H * (0.62 + 0.25 * k);
        for (let i = 0; i < 26; i++) {
          const f = i / 25,
            y = top + (bottom - top) * f;
          const w = (34 - 30 * f) * (0.6 + 0.6 * k);
          const x = baseX + Math.sin(t * 4 + f * 6) * 6 * f;
          ctx.strokeStyle = `rgba(71,85,105,${0.25 + 0.5 * k})`;
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.ellipse(x, y, w, 3, Math.sin(t * 6 + i) * 0.2, 0, Math.PI * 2);
          ctx.stroke();
        }
        // debris cloud
        ctx.fillStyle = `rgba(120,113,108,${0.35 * k})`;
        for (let i = 0; i < 14; i++) {
          const a = t * 3 + i;
          ctx.beginPath();
          ctx.arc(baseX + Math.cos(a) * 18 * k, bottom + Math.sin(a) * 4 - 2, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // lightning
      const rate = s.thunderProb / 100;
      if (flash <= 0 && Math.random() < rate * 0.025) {
        flash = 1;
        const x0 = W * (0.25 + Math.random() * 0.5);
        bolt = [[x0, H * 0.2]];
        while (bolt[bolt.length - 1][1] < H * 0.85) {
          const [x, y] = bolt[bolt.length - 1];
          bolt.push([x + (Math.random() - 0.5) * 26, y + 10 + Math.random() * 12]);
        }
      }
      if (flash > 0) {
        ctx.strokeStyle = `rgba(255,255,255,${flash})`;
        ctx.lineWidth = 2.4;
        ctx.shadowColor = "#fef08a";
        ctx.shadowBlur = 12;
        ctx.beginPath();
        bolt.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
        ctx.shadowBlur = 0;
        flash -= 0.08;
      }
      // precipitation
      const intensity = Math.min(1, s.precip / 8);
      const nDrops = Math.round(drops.length * intensity);
      const slant = s.wind / 25;
      const snowy = s.snow > 0 || s.temp < 1;
      for (let i = 0; i < nDrops; i++) {
        const d = drops[i];
        d.y += (snowy ? 0.004 : 0.03) * d.z * (s.hail ? 1.3 : 1);
        d.x += snowy ? Math.sin(t * 2 + i) * 0.0008 : slant * 0.002;
        if (d.y > 1) {
          d.y = 0;
          d.x = Math.random();
        }
        if (d.x > 1) d.x -= 1;
        const x = d.x * W,
          y = d.y * H;
        if (snowy) {
          ctx.fillStyle = "rgba(255,255,255,.9)";
          ctx.beginPath();
          ctx.arc(x, y, 1.8 * d.z, 0, Math.PI * 2);
          ctx.fill();
        } else if (s.hail && i % 6 === 0) {
          ctx.fillStyle = "#e2e8f0";
          ctx.beginPath();
          ctx.arc(x, y, 2.4, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.strokeStyle = `rgba(191,219,254,${0.5 + 0.4 * d.z})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + slant * 3, y + 9 * d.z);
          ctx.stroke();
        }
      }
      // ground with swaying grass/trees
      const gy = H * 0.86;
      ctx.fillStyle = s.isDay
        ? s.temp > 38 && s.precip === 0
          ? "#a16207"
          : snowy
            ? "#e2e8f0"
            : "#15803d"
        : "#0f2417";
      ctx.fillRect(0, gy, W, H - gy);
      const sway = Math.sin(t * (1 + s.wind / 20)) * Math.min(14, s.wind / 4);
      for (let i = 0; i < 6; i++) {
        const x = (i + 0.5) * (W / 6);
        ctx.strokeStyle = s.isDay ? "#713f12" : "#1c1917";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x, gy);
        ctx.quadraticCurveTo(x, gy - 18, x + sway, gy - 34);
        ctx.stroke();
        ctx.fillStyle = s.isDay ? "#166534" : "#052e16";
        ctx.beginPath();
        ctx.arc(x + sway, gy - 38, 11, 0, Math.PI * 2);
        ctx.fill();
      }
      // fog / haze
      if (s.visibility < 5000) {
        const a = Math.min(0.85, (5000 - s.visibility) / 5000);
        const fg = ctx.createLinearGradient(0, H * 0.3, 0, H);
        fg.addColorStop(0, `rgba(226,232,240,0)`);
        fg.addColorStop(1, `rgba(226,232,240,${a})`);
        ctx.fillStyle = fg;
        ctx.fillRect(0, 0, W, H);
      }
      // heat shimmer
      if (s.temp >= 38 && s.isDay) {
        ctx.strokeStyle = "rgba(255,255,255,.18)";
        ctx.lineWidth = 1;
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          for (let x = 0; x < W; x += 6)
            ctx.lineTo(x, gy - 6 - i * 5 + Math.sin(x / 14 + t * 5 + i) * 1.6);
          ctx.stroke();
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [height]);

  return (
    <canvas
      ref={ref}
      className="block w-full rounded-2xl"
      style={{ height }}
      aria-label="Animated sky simulation"
      role="img"
    />
  );
}

function mix(a: string, b: string, f: number) {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = p(a),
    [r2, g2, b2] = p(b);
  const k = Math.max(0, Math.min(1, f));
  return `rgb(${Math.round(r1 + (r2 - r1) * k)},${Math.round(g1 + (g2 - g1) * k)},${Math.round(b1 + (b2 - b1) * k)})`;
}
