import { useMemo, useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ClimateProfile } from "@/lib/climate/types";
import {
  characteristics,
  cpcbAqi,
  describeCode,
  droughtIndex,
  heatIndex,
  LEVEL_LABEL,
  monsoonTiming,
  wetBulb,
  type Alert,
  type HourDiag,
  STAGE_ORDER,
} from "@/lib/climate/analysis";
import { dayOfYear, fmtDay, fmtHour, monthlyAt, MONTHS } from "@/lib/climate/time";
import { ChartTip, LevelPill, Section, SourceTag, Stat, VIZ } from "./ui";
import { LEVEL_COLOR } from "./hazardIcons";

const compass = (d: number) =>
  [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
  ][Math.round(d / 22.5) % 16];
const r0 = (x: number) => Math.round(x);
const r1 = (x: number) => Math.round(x * 10) / 10;
const H_CHART = 170;

function Seg<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-full bg-foreground/5 p-0.5 text-[11px]">
      {options.map(([v, l]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`rounded-full px-2.5 py-1 transition-colors ${value === v ? "bg-background font-semibold shadow-sm" : "text-muted-foreground"}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function Legend({ items }: { items: [string, string, ("line" | "bar" | "dash")?][] }) {
  return (
    <div className="mb-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
      {items.map(([c, l, k]) => (
        <span key={l} className="inline-flex items-center gap-1.5">
          {k === "bar" ? (
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: c }} />
          ) : (
            <span
              className="h-0.5 w-3.5 rounded"
              style={{
                background: c,
                borderTop: k === "dash" ? `2px dashed ${c}` : undefined,
                height: k === "dash" ? 0 : undefined,
              }}
            />
          )}
          {l}
        </span>
      ))}
    </div>
  );
}

/* ================= Overview ================= */
export function OverviewTab({ p, alerts }: { p: ClimateProfile; alerts: Alert[] }) {
  const groups = useMemo(() => characteristics(p), [p]);
  return (
    <div className="space-y-4">
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.slice(0, 3).map((a) => (
            <div
              key={a.id}
              className="flex items-start gap-3 rounded-2xl px-3 py-2"
              style={{
                background: `color-mix(in oklab, ${LEVEL_COLOR[a.level]} 10%, transparent)`,
              }}
            >
              <span
                className="mt-1 h-8 w-1 shrink-0 rounded-full"
                style={{ background: LEVEL_COLOR[a.level] }}
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {a.hazard}: <span className="font-normal">{a.title}</span>
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {a.when}
                  {a.simulated ? " · simulated" : ""}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
      {groups.map((g) => (
        <Section key={g.title} title={g.title}>
          <dl className="divide-y divide-border/50">
            {g.items.map((it) => (
              <div key={it.label} className="flex items-baseline gap-3 py-1.5">
                <dt className="w-[42%] shrink-0 text-xs text-muted-foreground">{it.label}</dt>
                <dd className="min-w-0 flex-1 text-sm">
                  <span className="font-medium">{it.value}</span>
                  {it.note && (
                    <span className="block text-[11px] text-muted-foreground">{it.note}</span>
                  )}
                </dd>
                <SourceTag src={it.src} />
              </div>
            ))}
          </dl>
        </Section>
      ))}
      <Section title="Datasets combined for this spot">
        <ul className="space-y-1 text-xs">
          {Object.entries(p.datasets).map(([k, v]) => (
            <li key={k} className="flex gap-2">
              <span className="w-20 shrink-0 font-mono uppercase text-muted-foreground">{k}</span>
              <span className="flex-1">{v}</span>
              <SourceTag src={p.sources[k as keyof typeof p.sources]} />
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

/* ================= Now ================= */
export function NowTab({ p, i0, diag }: { p: ClimateProfile; i0: number; diag: HourDiag }) {
  const H = p.hourly,
    i = i0;
  const hi = heatIndex(H.temp[i], H.rh[i]),
    wb = wetBulb(H.temp[i], H.rh[i]);
  const data = H.time.slice(Math.max(0, i - 24), i + 1).map((t, k) => {
    const j = Math.max(0, i - 24) + k;
    return { t: fmtHour(t), temp: H.temp[j], feels: H.feels[j], dew: H.dew[j] };
  });
  return (
    <div className="space-y-4">
      <Section
        title="Current conditions"
        src={p.sources.hourly}
        right={<span className="text-[11px] text-muted-foreground">{describeCode(H.code[i])}</span>}
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat
            label="Temperature"
            value={r1(H.temp[i])}
            unit="°C"
            sub={`Feels ${r1(H.feels[i])}°C`}
          />
          <Stat label="Humidity" value={r0(H.rh[i])} unit="%" sub={`Dew point ${r1(H.dew[i])}°C`} />
          <Stat
            label="Wet-bulb"
            value={r1(wb)}
            unit="°C"
            sub={wb >= 31 ? "Dangerous" : wb >= 28 ? "High stress" : "Safe"}
            tone={wb >= 31 ? LEVEL_COLOR.red : wb >= 28 ? LEVEL_COLOR.orange : undefined}
          />
          <Stat
            label="Heat index"
            value={r1(hi)}
            unit="°C"
            sub={
              hi >= 41
                ? "Danger"
                : hi >= 32
                  ? "Extreme caution"
                  : hi >= 27
                    ? "Caution"
                    : "Comfortable"
            }
          />
          <Stat
            label="Wind"
            value={r0(H.wind[i])}
            unit="km/h"
            sub={`From ${compass(H.windDir[i])} · gust ${r0(H.gust[i])}`}
          />
          <Stat
            label="Pressure"
            value={r0(H.pressure[i])}
            unit="hPa"
            sub={
              H.pressure[i] < 1000
                ? "Low — unsettled"
                : H.pressure[i] > 1015
                  ? "High — settled"
                  : "Normal"
            }
          />
          <Stat label="Cloud cover" value={r0(H.cloud[i])} unit="%" />
          <Stat
            label="Visibility"
            value={H.visibility[i] >= 1000 ? r1(H.visibility[i] / 1000) : r0(H.visibility[i])}
            unit={H.visibility[i] >= 1000 ? "km" : "m"}
            sub={H.visibility[i] < 1000 ? "Fog" : H.visibility[i] < 5000 ? "Haze / mist" : "Clear"}
          />
          <Stat
            label="UV index"
            value={r1(H.uv[i])}
            sub={
              H.uv[i] >= 11
                ? "Extreme"
                : H.uv[i] >= 8
                  ? "Very high"
                  : H.uv[i] >= 6
                    ? "High"
                    : H.uv[i] >= 3
                      ? "Moderate"
                      : "Low"
            }
          />
          <Stat
            label="Rain (last hour)"
            value={r1(H.precip[i])}
            unit="mm"
            sub={`Chance ${r0(H.precipProb[i])}%`}
          />
          <Stat
            label="CAPE"
            value={r0(H.cape[i])}
            unit="J/kg"
            sub={
              H.cape[i] > 2500
                ? "Extreme instability"
                : H.cape[i] > 1000
                  ? "Unstable"
                  : "Stable-ish"
            }
          />
          <Stat
            label="Lifted index"
            value={r1(H.li[i])}
            sub={H.li[i] < -6 ? "Severe storms" : H.li[i] < -2 ? "Storms possible" : "Stable"}
          />
          <Stat label="Convective inhibition" value={r0(Math.abs(H.cin[i]))} unit="J/kg" />
          <Stat label="Freezing level" value={r0(H.freezing[i])} unit="m" />
          <Stat label="Cloud base (LCL)" value={diag.lcl} unit="m" />
          <Stat label="Deep shear 0–6 km" value={diag.shear06} unit="m/s" />
          <Stat label="Soil moisture" value={H.soilMoist[i].toFixed(2)} unit="m³/m³" />
          <Stat label="Snowfall" value={r1(H.snow[i])} unit="cm" />
        </div>
      </Section>
      <Section title="Past 24 hours" src={p.sources.hourly}>
        <Legend
          items={[
            [VIZ.s2, "Temperature"],
            [VIZ.s5, "Feels like"],
            [VIZ.s1, "Dew point"],
          ]}
        />
        <ResponsiveContainer width="100%" height={H_CHART}>
          <LineChart data={data} margin={{ left: -18, right: 14, top: 4 }}>
            <CartesianGrid stroke={VIZ.grid} vertical={false} />
            <XAxis dataKey="t" tick={VIZ.axis} interval={3} tickLine={false} axisLine={false} />
            <YAxis tick={VIZ.axis} tickLine={false} axisLine={false} unit="°" />
            <Tooltip content={<ChartTip fmt={(v) => `${v}°C`} />} />
            <Line dataKey="temp" name="Temperature" stroke={VIZ.s2} strokeWidth={2} dot={false} />
            <Line
              dataKey="feels"
              name="Feels like"
              stroke={VIZ.s5}
              strokeWidth={2}
              dot={false}
              strokeDasharray="4 3"
            />
            <Line dataKey="dew" name="Dew point" stroke={VIZ.s1} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Section>
    </div>
  );
}

/* ================= Forecast (interval) ================= */
type FInt = "24h" | "72h" | "7d" | "16d";
export function ForecastTab({ p, i0 }: { p: ClimateProfile; i0: number }) {
  const [iv, setIv] = useState<FInt>("72h");
  const H = p.hourly,
    D = p.daily;
  const hourly = iv === "24h" || iv === "72h";
  const n = iv === "24h" ? 24 : 72;
  const hdata = useMemo(
    () =>
      H.time.slice(i0, i0 + n).map((t, k) => {
        const j = i0 + k;
        return {
          t:
            k % 24 === 0 || iv === "24h"
              ? `${fmtHour(t)}${k % 24 === 0 && k ? " " + fmtDay(t).split(" ")[0] : ""}`
              : fmtHour(t),
          temp: H.temp[j],
          feels: H.feels[j],
          precip: H.precip[j],
          prob: H.precipProb[j],
          wind: H.wind[j],
          gust: H.gust[j],
        };
      }),
    [p, i0, n],
  );
  const d0 = Math.max(0, D.time.indexOf(H.time[i0].slice(0, 10)));
  const nd = iv === "7d" ? 7 : 16;
  const ddata = D.time.slice(d0, d0 + nd).map((t, k) => {
    const j = d0 + k;
    const normal = monthlyAt(p.normals.tmax, dayOfYear(t));
    return {
      t: fmtDay(t),
      range: [D.tmin[j], D.tmax[j]],
      tmax: D.tmax[j],
      tmin: D.tmin[j],
      normal: r1(normal),
      precip: D.precip[j],
      prob: D.precipProb[j],
      gust: D.gustMax[j],
      code: D.code[j],
      uv: D.uvMax[j],
    };
  });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Seg
          value={iv}
          onChange={setIv}
          options={[
            ["24h", "24 h"],
            ["72h", "3 days"],
            ["7d", "7 days"],
            ["16d", "16 days"],
          ]}
        />
        <SourceTag src={hourly ? p.sources.hourly : p.sources.daily} />
      </div>
      {hourly ? (
        <>
          <Section title="Temperature">
            <Legend
              items={[
                [VIZ.s2, "Temperature"],
                [VIZ.s5, "Feels like", "dash"],
              ]}
            />
            <ResponsiveContainer width="100%" height={H_CHART}>
              <LineChart data={hdata} margin={{ left: -18, right: 14, top: 4 }}>
                <CartesianGrid stroke={VIZ.grid} vertical={false} />
                <XAxis
                  dataKey="t"
                  tick={VIZ.axis}
                  interval={iv === "24h" ? 2 : 5}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={VIZ.axis}
                  tickLine={false}
                  axisLine={false}
                  unit="°"
                  domain={["auto", "auto"]}
                />
                <Tooltip content={<ChartTip fmt={(v) => `${v}°C`} />} />
                <Line
                  dataKey="temp"
                  name="Temperature"
                  stroke={VIZ.s2}
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  dataKey="feels"
                  name="Feels like"
                  stroke={VIZ.s5}
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </Section>
          <Section title="Rain (mm/h) and chance">
            <ResponsiveContainer width="100%" height={130}>
              <BarChart data={hdata} margin={{ left: -18, right: 14, top: 4 }}>
                <CartesianGrid stroke={VIZ.grid} vertical={false} />
                <XAxis
                  dataKey="t"
                  tick={VIZ.axis}
                  interval={iv === "24h" ? 2 : 5}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis tick={VIZ.axis} tickLine={false} axisLine={false} />
                <Tooltip
                  content={<ChartTip fmt={(v, n) => (n === "Chance" ? `${v}%` : `${v} mm`)} />}
                />
                <Bar dataKey="precip" name="Rain" fill={VIZ.s1} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div
              className="mt-1 flex h-2 gap-px overflow-hidden rounded-full"
              title="Chance of rain"
            >
              {hdata.map((x, k) => (
                <span
                  key={k}
                  className="flex-1"
                  style={{ background: VIZ.s1, opacity: 0.08 + (x.prob / 100) * 0.9 }}
                />
              ))}
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Strip shows chance of rain (darker = likelier).
            </p>
          </Section>
          <Section title="Wind & gusts (km/h)">
            <Legend
              items={[
                [VIZ.s3, "Wind"],
                [VIZ.s4, "Gust"],
              ]}
            />
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={hdata} margin={{ left: -18, right: 14, top: 4 }}>
                <CartesianGrid stroke={VIZ.grid} vertical={false} />
                <XAxis
                  dataKey="t"
                  tick={VIZ.axis}
                  interval={iv === "24h" ? 2 : 5}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis tick={VIZ.axis} tickLine={false} axisLine={false} />
                <ReferenceLine
                  y={60}
                  stroke={LEVEL_COLOR.orange}
                  strokeDasharray="3 3"
                  label={{
                    value: "squall 60",
                    fontSize: 9,
                    fill: LEVEL_COLOR.orange,
                    position: "insideTopRight",
                  }}
                />
                <Tooltip content={<ChartTip fmt={(v) => `${v} km/h`} />} />
                <Line dataKey="wind" name="Wind" stroke={VIZ.s3} strokeWidth={2} dot={false} />
                <Line dataKey="gust" name="Gust" stroke={VIZ.s4} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Section>
        </>
      ) : (
        <>
          <Section title="Daily range vs normal max">
            <Legend
              items={[
                [VIZ.s2, "Min–max range", "bar"],
                [VIZ.s7, "Normal max", "dash"],
              ]}
            />
            <ResponsiveContainer width="100%" height={190}>
              <ComposedChart data={ddata} margin={{ left: -18, right: 14, top: 4 }}>
                <CartesianGrid stroke={VIZ.grid} vertical={false} />
                <XAxis
                  dataKey="t"
                  tick={VIZ.axis}
                  tickLine={false}
                  axisLine={false}
                  interval={nd > 7 ? 2 : 0}
                />
                <YAxis
                  tick={VIZ.axis}
                  tickLine={false}
                  axisLine={false}
                  unit="°"
                  domain={["auto", "auto"]}
                />
                <Tooltip content={<ChartTip fmt={(v) => `${v}°C`} />} />
                <Bar
                  dataKey="range"
                  name="Min–max"
                  fill={VIZ.s2}
                  radius={4}
                  barSize={nd > 7 ? 10 : 16}
                />
                <Line
                  dataKey="normal"
                  name="Normal max"
                  stroke={VIZ.s7}
                  strokeDasharray="4 3"
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </Section>
          <Section title="Daily rainfall (mm)">
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={ddata} margin={{ left: -18, right: 14, top: 4 }}>
                <CartesianGrid stroke={VIZ.grid} vertical={false} />
                <XAxis
                  dataKey="t"
                  tick={VIZ.axis}
                  tickLine={false}
                  axisLine={false}
                  interval={nd > 7 ? 2 : 0}
                />
                <YAxis tick={VIZ.axis} tickLine={false} axisLine={false} />
                <ReferenceLine
                  y={64.5}
                  stroke={LEVEL_COLOR.orange}
                  strokeDasharray="3 3"
                  label={{
                    value: "heavy 64.5",
                    fontSize: 9,
                    fill: LEVEL_COLOR.orange,
                    position: "insideTopRight",
                  }}
                />
                <Tooltip content={<ChartTip fmt={(v) => `${v} mm`} />} />
                <Bar dataKey="precip" name="Rain" fill={VIZ.s1} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Section>
          <div className="overflow-x-auto rounded-2xl border border-border/60">
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr className="border-b border-border/60">
                  {["Day", "Sky", "Max", "Min", "Rain", "Chance", "Gust", "UV"].map((h) => (
                    <th key={h} className="px-2 py-2 text-left font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ddata.map((d) => (
                  <tr key={d.t} className="border-b border-border/30 last:border-0">
                    <td className="px-2 py-1.5 font-medium">{d.t}</td>
                    <td className="px-2">{describeCode(d.code)}</td>
                    <td className="px-2 font-mono">{r0(d.tmax)}°</td>
                    <td className="px-2 font-mono">{r0(d.tmin)}°</td>
                    <td className="px-2 font-mono">{r1(d.precip)}</td>
                    <td className="px-2 font-mono">{r0(d.prob)}%</td>
                    <td className="px-2 font-mono">{r0(d.gust)}</td>
                    <td className="px-2 font-mono">{r0(d.uv)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/* ================= Storms ================= */
export function StormsTab({ p, i0, diags }: { p: ClimateProfile; i0: number; diags: HourDiag[] }) {
  const H = p.hourly;
  const data = diags.map((d, k) => ({
    t: k === 0 ? "now" : `+${k}h`,
    thunder: d.thunderProb,
    score: d.stormScore,
    tor: d.tornadoIndex,
    cape: H.cape[i0 + k],
    s06: d.shear06,
    s01: d.shear01,
    stage: STAGE_ORDER.indexOf(d.stage),
  }));
  const peak = diags.reduce((a, b) => (b.stormScore > a.stormScore ? b : a), diags[0]);
  const maxTor = Math.max(...diags.map((d) => d.tornadoIndex));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat
          label="Peak storm score"
          value={peak.stormScore}
          unit="/100"
          sub={peak.stage}
          tone={
            peak.stormScore >= 60
              ? LEVEL_COLOR.red
              : peak.stormScore >= 40
                ? LEVEL_COLOR.orange
                : undefined
          }
        />
        <Stat
          label="Max thunder chance"
          value={Math.max(...diags.map((d) => d.thunderProb))}
          unit="%"
        />
        <Stat
          label="Max tornado index"
          value={maxTor.toFixed(2)}
          sub={maxTor >= 1 ? "Notable" : maxTor >= 0.5 ? "Marginal" : "Very low"}
          tone={maxTor >= 1 ? LEVEL_COLOR.orange : undefined}
        />
        <Stat
          label="Hail / squall hours"
          value={`${diags.filter((d) => d.hail).length} / ${diags.filter((d) => d.squall).length}`}
        />
      </div>
      <Section title="Storm life-cycle — next 48 h" src={p.sources.hourly}>
        <div className="flex h-24 items-end gap-px">
          {diags.map((d, k) => {
            const lvl = STAGE_ORDER.indexOf(d.stage);
            const c =
              lvl >= 5
                ? "#7c3aed"
                : lvl >= 4
                  ? LEVEL_COLOR.red
                  : lvl >= 3
                    ? LEVEL_COLOR.orange
                    : lvl >= 2
                      ? LEVEL_COLOR.yellow
                      : lvl >= 1
                        ? "#94a3b8"
                        : "color-mix(in oklab, currentColor 12%, transparent)";
            return (
              <div
                key={k}
                title={`${data[k].t}: ${d.stage}`}
                className="flex-1 rounded-t-sm transition-all"
                style={{ height: `${12 + lvl * 17}%`, background: c }}
              />
            );
          })}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          <span>now</span>
          <span>+12h</span>
          <span>+24h</span>
          <span>+36h</span>
          <span>+48h</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
          {STAGE_ORDER.map((s, k) => (
            <span key={s} className="inline-flex items-center gap-1">
              <span
                className="h-2 w-2 rounded-sm"
                style={{
                  background: [
                    "#cbd5e1",
                    "#94a3b8",
                    LEVEL_COLOR.yellow,
                    LEVEL_COLOR.orange,
                    LEVEL_COLOR.red,
                    "#7c3aed",
                  ][k],
                }}
              />
              {s}
            </span>
          ))}
        </div>
      </Section>
      <Section title="Thunderstorm probability & storm score (%)">
        <Legend
          items={[
            [VIZ.s7, "Thunder chance"],
            [VIZ.s2, "Storm score"],
          ]}
        />
        <ResponsiveContainer width="100%" height={H_CHART}>
          <ComposedChart data={data} margin={{ left: -18, right: 14, top: 4 }}>
            <CartesianGrid stroke={VIZ.grid} vertical={false} />
            <XAxis dataKey="t" tick={VIZ.axis} interval={5} tickLine={false} axisLine={false} />
            <YAxis tick={VIZ.axis} tickLine={false} axisLine={false} domain={[0, 100]} />
            <ReferenceArea y1={50} y2={100} fill={LEVEL_COLOR.orange} fillOpacity={0.06} />
            <Tooltip content={<ChartTip fmt={(v) => `${v}%`} />} />
            <Area
              dataKey="thunder"
              name="Thunder chance"
              stroke={VIZ.s7}
              fill={VIZ.s7}
              fillOpacity={0.15}
              strokeWidth={2}
            />
            <Line dataKey="score" name="Storm score" stroke={VIZ.s2} strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </Section>
      <Section title="Instability — CAPE (J/kg)">
        <ResponsiveContainer width="100%" height={140}>
          <ComposedChart data={data} margin={{ left: -10, right: 14, top: 4 }}>
            <CartesianGrid stroke={VIZ.grid} vertical={false} />
            <XAxis dataKey="t" tick={VIZ.axis} interval={5} tickLine={false} axisLine={false} />
            <YAxis tick={VIZ.axis} tickLine={false} axisLine={false} />
            <ReferenceLine
              y={1000}
              stroke={LEVEL_COLOR.yellow}
              strokeDasharray="3 3"
              label={{
                value: "unstable",
                fontSize: 9,
                fill: "#a16207",
                position: "insideTopRight",
              }}
            />
            <ReferenceLine
              y={2500}
              stroke={LEVEL_COLOR.red}
              strokeDasharray="3 3"
              label={{
                value: "extreme",
                fontSize: 9,
                fill: LEVEL_COLOR.red,
                position: "insideTopRight",
              }}
            />
            <Tooltip content={<ChartTip fmt={(v) => `${v} J/kg`} />} />
            <Area
              dataKey="cape"
              name="CAPE"
              stroke={VIZ.s4}
              fill={VIZ.s4}
              fillOpacity={0.2}
              strokeWidth={2}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </Section>
      <Section title="Tornado ingredients">
        <Legend
          items={[
            [VIZ.s1, "0–6 km shear (m/s)"],
            [VIZ.s3, "0–1 km shear (m/s)"],
          ]}
        />
        <ResponsiveContainer width="100%" height={130}>
          <LineChart data={data} margin={{ left: -18, right: 14, top: 4 }}>
            <CartesianGrid stroke={VIZ.grid} vertical={false} />
            <XAxis dataKey="t" tick={VIZ.axis} interval={5} tickLine={false} axisLine={false} />
            <YAxis tick={VIZ.axis} tickLine={false} axisLine={false} />
            <ReferenceLine
              y={20}
              stroke={VIZ.s1}
              strokeDasharray="3 3"
              label={{
                value: "supercell shear",
                fontSize: 9,
                fill: VIZ.s1,
                position: "insideTopRight",
              }}
            />
            <Tooltip content={<ChartTip fmt={(v) => `${v} m/s`} />} />
            <Line dataKey="s06" name="0–6 km shear" stroke={VIZ.s1} strokeWidth={2} dot={false} />
            <Line dataKey="s01" name="0–1 km shear" stroke={VIZ.s3} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
        <ResponsiveContainer width="100%" height={110}>
          <BarChart data={data} margin={{ left: -18, right: 14, top: 8 }}>
            <XAxis dataKey="t" tick={VIZ.axis} interval={5} tickLine={false} axisLine={false} />
            <YAxis tick={VIZ.axis} tickLine={false} axisLine={false} />
            <ReferenceLine y={1} stroke={LEVEL_COLOR.orange} strokeDasharray="3 3" />
            <Tooltip content={<ChartTip fmt={(v) => `${v}`} />} />
            <Bar dataKey="tor" name="Tornado index" radius={[3, 3, 0, 0]}>
              {data.map((d, k) => (
                <Cell
                  key={k}
                  fill={
                    d.tor >= 1 ? LEVEL_COLOR.red : d.tor >= 0.5 ? LEVEL_COLOR.orange : "#94a3b8"
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          Tornado index combines instability (CAPE), a low cloud base (LCL), low-level and
          deep-layer wind shear and convective inhibition, similar to the Significant Tornado
          Parameter. Values ≥ 1 mean rotating storms are possible; India's tornadoes are rare and
          mostly occur in the pre-monsoon (Mar–May) over West Bengal, Odisha, Bangladesh border and
          Assam.
        </p>
      </Section>
    </div>
  );
}

/* ================= Climate (history) ================= */
export function ClimateTab({ p }: { p: ClimateProfile }) {
  const n = p.normals,
    h = p.history;
  const monthly = MONTHS.map((m, i) => ({
    m,
    tmax: n.tmax[i],
    tmin: n.tmin[i],
    rain: n.precip[i],
    rh: n.rh[i],
  }));
  const base = h.tmean.slice(0, Math.min(30, h.tmean.length));
  const mean = base.reduce((a, b) => a + b, 0) / Math.max(1, base.length);
  const annual = h.years.map((y, i) => ({
    y: String(y),
    anom: r1(h.tmean[i] - mean),
    rain: h.precip[i],
    hot: h.hotDays[i],
    heavy: h.heavyRainDays[i],
  }));
  const maxAbs = Math.max(0.5, ...annual.map((a) => Math.abs(a.anom)));
  const meanRain = h.precip.reduce((a, b) => a + b, 0) / Math.max(1, h.precip.length);
  const pent = h.pentadRain.map((v, i) => ({
    d: new Date(Date.UTC(2001, 0, 1 + i * 5)).toLocaleDateString("en-IN", {
      month: "short",
      timeZone: "UTC",
    }),
    v,
  }));
  const mt = monsoonTiming(h.pentadRain);
  return (
    <div className="space-y-4">
      <Section title="Monthly normals — temperature (°C)" src={p.sources.normals}>
        <Legend
          items={[
            [VIZ.s2, "Average max"],
            [VIZ.s1, "Average min"],
          ]}
        />
        <ResponsiveContainer width="100%" height={H_CHART}>
          <LineChart data={monthly} margin={{ left: -18, right: 14, top: 4 }}>
            <CartesianGrid stroke={VIZ.grid} vertical={false} />
            <XAxis dataKey="m" tick={VIZ.axis} tickLine={false} axisLine={false} />
            <YAxis tick={VIZ.axis} tickLine={false} axisLine={false} unit="°" />
            <Tooltip content={<ChartTip fmt={(v) => `${v}°C`} />} />
            <Line dataKey="tmax" name="Avg max" stroke={VIZ.s2} strokeWidth={2} dot={{ r: 3 }} />
            <Line dataKey="tmin" name="Avg min" stroke={VIZ.s1} strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </Section>
      <Section title="Monthly normals — rainfall (mm)" src={p.sources.normals}>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={monthly} margin={{ left: -12, right: 14, top: 4 }}>
            <CartesianGrid stroke={VIZ.grid} vertical={false} />
            <XAxis dataKey="m" tick={VIZ.axis} tickLine={false} axisLine={false} />
            <YAxis tick={VIZ.axis} tickLine={false} axisLine={false} />
            <Tooltip content={<ChartTip fmt={(v) => `${v} mm`} />} />
            <Bar dataKey="rain" name="Rainfall" fill={VIZ.s1} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Section>
      <Section
        title={`Warming stripes ${h.years[0]}–${h.years[h.years.length - 1]}`}
        src={p.sources.history}
      >
        <div className="flex h-16 overflow-hidden rounded-xl">
          {annual.map((a) => {
            const f = a.anom / maxAbs;
            const c =
              f >= 0
                ? `color-mix(in oklab, #dc2626 ${Math.round(f * 100)}%, #e5e5e5)`
                : `color-mix(in oklab, #2a78d6 ${Math.round(-f * 100)}%, #e5e5e5)`;
            return (
              <div
                key={a.y}
                title={`${a.y}: ${a.anom >= 0 ? "+" : ""}${a.anom}°C`}
                className="flex-1"
                style={{ background: c }}
              />
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Each stripe is one year's mean temperature vs the {h.years[0]}–
          {h.years[Math.min(29, h.years.length - 1)]} average (blue cooler, red warmer).
        </p>
      </Section>
      <Section title="Annual rainfall (mm)" src={p.sources.history}>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={annual} margin={{ left: -10, right: 14, top: 4 }}>
            <XAxis dataKey="y" tick={VIZ.axis} interval={5} tickLine={false} axisLine={false} />
            <YAxis tick={VIZ.axis} tickLine={false} axisLine={false} />
            <ReferenceLine
              y={meanRain}
              stroke="currentColor"
              strokeOpacity={0.4}
              strokeDasharray="3 3"
            />
            <Tooltip content={<ChartTip fmt={(v) => `${v} mm`} />} />
            <Bar dataKey="rain" name="Rainfall" radius={[3, 3, 0, 0]}>
              {annual.map((a) => (
                <Cell
                  key={a.y}
                  fill={
                    a.rain < meanRain * 0.8 ? VIZ.s2 : a.rain > meanRain * 1.2 ? VIZ.s1 : "#94a3b8"
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <p className="text-[11px] text-muted-foreground">
          Orange = deficient year (&lt;80% of mean), blue = excess (&gt;120%).
        </p>
      </Section>
      <div className="grid gap-4 sm:grid-cols-2">
        <Section title="Days ≥ 40 °C per year">
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={annual} margin={{ left: -24, right: 4, top: 4 }}>
              <XAxis dataKey="y" tick={VIZ.axis} interval={9} tickLine={false} axisLine={false} />
              <YAxis tick={VIZ.axis} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip content={<ChartTip fmt={(v) => `${v} days`} />} />
              <Bar dataKey="hot" name="Hot days" fill={VIZ.s2} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Section>
        <Section title="Heavy-rain days per year">
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={annual} margin={{ left: -24, right: 4, top: 4 }}>
              <XAxis dataKey="y" tick={VIZ.axis} interval={9} tickLine={false} axisLine={false} />
              <YAxis tick={VIZ.axis} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip content={<ChartTip fmt={(v) => `${v} days`} />} />
              <Bar dataKey="heavy" name="≥64.5 mm days" fill={VIZ.s1} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Section>
      </div>
      <Section
        title="Seasonal rain cycle (mm/day, 5-day means)"
        src={p.sources.history}
        right={
          <span className="text-[11px] text-muted-foreground">
            Onset {mt.onset} · withdrawal {mt.withdrawal}
          </span>
        }
      >
        <ResponsiveContainer width="100%" height={130}>
          <ComposedChart data={pent} margin={{ left: -18, right: 14, top: 4 }}>
            <XAxis dataKey="d" tick={VIZ.axis} interval={6} tickLine={false} axisLine={false} />
            <YAxis tick={VIZ.axis} tickLine={false} axisLine={false} />
            <Tooltip content={<ChartTip fmt={(v) => `${v} mm/day`} />} />
            <Area
              dataKey="v"
              name="Rain"
              stroke={VIZ.s1}
              fill={VIZ.s1}
              fillOpacity={0.2}
              strokeWidth={2}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </Section>
    </div>
  );
}

/* ================= Future (projection intervals) ================= */
type PInt = "2026-2030" | "2031-2040" | "2041-2050";
export function FutureTab({ p }: { p: ClimateProfile }) {
  const [iv, setIv] = useState<PInt>("2041-2050");
  const P = p.projections;
  const [a, b] = iv.split("-").map(Number);
  const idx = P.years.map((y, i) => (y >= a && y <= b ? i : -1)).filter((i) => i >= 0);
  const avg = (arr: number[]) => idx.reduce((s, i) => s + arr[i], 0) / Math.max(1, idx.length);
  const dT = avg(P.tmean) - P.baselineTmean,
    dTlo = avg(P.tmeanLo) - P.baselineTmean,
    dThi = avg(P.tmeanHi) - P.baselineTmean;
  const dP = ((avg(P.precip) - P.baselinePrecip) / Math.max(1, P.baselinePrecip)) * 100;
  const hot = avg(P.hotDays);
  const data = P.years.map((y, i) => ({
    y: String(y),
    t: P.tmean[i],
    band: [P.tmeanLo[i], P.tmeanHi[i]],
    p: P.precip[i],
    pband: [P.precipLo[i], P.precipHi[i]],
    hot: P.hotDays[i],
  }));
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Seg
          value={iv}
          onChange={setIv}
          options={[
            ["2026-2030", "2026–30"],
            ["2031-2040", "2031–40"],
            ["2041-2050", "2041–50"],
          ]}
        />
        <SourceTag src={p.sources.projections} />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat
          label="Warming"
          value={`+${dT.toFixed(1)}`}
          unit="°C"
          sub={`range ${dTlo.toFixed(1)} to ${dThi.toFixed(1)}`}
          tone={dT > 1.5 ? LEVEL_COLOR.red : dT > 1 ? LEVEL_COLOR.orange : undefined}
        />
        <Stat
          label="Mean temperature"
          value={avg(P.tmean).toFixed(1)}
          unit="°C"
          sub={`baseline ${P.baselineTmean.toFixed(1)}°C`}
        />
        <Stat
          label="Rainfall change"
          value={`${dP >= 0 ? "+" : ""}${dP.toFixed(0)}`}
          unit="%"
          sub={`${Math.round(avg(P.precip))} mm/yr`}
        />
        <Stat
          label="Days ≥ 40 °C"
          value={Math.round(hot)}
          unit="/yr"
          sub={`baseline ${P.baselineHotDays}`}
        />
      </div>
      <Section title="Annual mean temperature (°C) with model spread">
        <Legend
          items={[
            [VIZ.s2, "Ensemble mean"],
            [VIZ.s2 + "40", "Model range", "bar"],
          ]}
        />
        <ResponsiveContainer width="100%" height={H_CHART}>
          <ComposedChart data={data} margin={{ left: -18, right: 14, top: 4 }}>
            <CartesianGrid stroke={VIZ.grid} vertical={false} />
            <XAxis dataKey="y" tick={VIZ.axis} interval={4} tickLine={false} axisLine={false} />
            <YAxis
              tick={VIZ.axis}
              tickLine={false}
              axisLine={false}
              domain={["auto", "auto"]}
              unit="°"
            />
            <ReferenceArea x1={String(a)} x2={String(b)} fill={VIZ.s7} fillOpacity={0.08} />
            <ReferenceLine
              y={P.baselineTmean}
              stroke="currentColor"
              strokeOpacity={0.35}
              strokeDasharray="3 3"
              label={{
                value: "1995–2014",
                fontSize: 9,
                fill: "currentColor",
                position: "insideBottomLeft",
              }}
            />
            <Tooltip content={<ChartTip fmt={(v) => `${Number(v).toFixed(2)}°C`} />} />
            <Area dataKey="band" name="Range" stroke="none" fill={VIZ.s2} fillOpacity={0.2} />
            <Line dataKey="t" name="Mean" stroke={VIZ.s2} strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </Section>
      <Section title="Annual rainfall (mm)">
        <ResponsiveContainer width="100%" height={140}>
          <ComposedChart data={data} margin={{ left: -10, right: 14, top: 4 }}>
            <CartesianGrid stroke={VIZ.grid} vertical={false} />
            <XAxis dataKey="y" tick={VIZ.axis} interval={4} tickLine={false} axisLine={false} />
            <YAxis tick={VIZ.axis} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
            <ReferenceArea x1={String(a)} x2={String(b)} fill={VIZ.s7} fillOpacity={0.08} />
            <ReferenceLine
              y={P.baselinePrecip}
              stroke="currentColor"
              strokeOpacity={0.35}
              strokeDasharray="3 3"
            />
            <Tooltip content={<ChartTip fmt={(v) => `${Math.round(v)} mm`} />} />
            <Area dataKey="pband" name="Range" stroke="none" fill={VIZ.s1} fillOpacity={0.18} />
            <Line dataKey="p" name="Mean" stroke={VIZ.s1} strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </Section>
      <Section title="Days ≥ 40 °C per year">
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={data} margin={{ left: -24, right: 14, top: 4 }}>
            <XAxis dataKey="y" tick={VIZ.axis} interval={4} tickLine={false} axisLine={false} />
            <YAxis tick={VIZ.axis} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip content={<ChartTip fmt={(v) => `${v} days`} />} />
            <Bar dataKey="hot" name="Hot days" radius={[2, 2, 0, 0]}>
              {data.map((d) => (
                <Cell key={d.y} fill={Number(d.y) >= a && Number(d.y) <= b ? VIZ.s2 : "#94a3b8"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Section>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Models: {P.models.join(", ")}. Each model's change from its own 1995–2014 climate is added
        to the observed baseline (delta bias correction) and smoothed with a 5-year running mean.
      </p>
    </div>
  );
}

/* ================= Air & Water ================= */
export function AirWaterTab({ p, i0 }: { p: ClimateProfile; i0: number }) {
  const A = p.air,
    F = p.flood,
    M = p.marine;
  const aq = cpcbAqi(A.current.pm25, A.current.pm10);
  const aqTone =
    aq.value > 300
      ? LEVEL_COLOR.red
      : aq.value > 200
        ? LEVEL_COLOR.orange
        : aq.value > 100
          ? LEVEL_COLOR.yellow
          : LEVEL_COLOR.green;
  const nowKey = p.hourly.time[i0];
  const a0 = Math.max(0, A.hourly.time.indexOf(nowKey));
  const aqData = A.hourly.time.slice(a0, a0 + 96).map((t, k) => ({
    t: k % 24 === 0 ? fmtDay(t) : fmtHour(t),
    pm25: A.hourly.pm25[a0 + k],
    pm10: A.hourly.pm10[a0 + k],
  }));
  const fData = F.time.map((t, k) => ({ t: fmtDay(t), q: F.discharge[k] }));
  const spi = droughtIndex(p);
  let c1 = 0,
    c2 = 0;
  const cum = p.recent.time.map((t, k) => {
    c1 += p.recent.precip[k];
    c2 += monthlyAt(p.normals.precip, dayOfYear(t)) / 30.44;
    return { t: fmtDay(t), obs: r0(c1), normal: r0(c2) };
  });
  return (
    <div className="space-y-4">
      <Section title="Air quality (CPCB AQI)" src={p.sources.air}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="AQI" value={aq.value} sub={aq.category} tone={aqTone} />
          <Stat
            label="PM2.5"
            value={r0(A.current.pm25)}
            unit="µg/m³"
            sub={`${(A.current.pm25 / 15).toFixed(1)}× WHO daily`}
          />
          <Stat label="PM10" value={r0(A.current.pm10)} unit="µg/m³" />
          <Stat label="NO₂" value={r0(A.current.no2)} unit="µg/m³" />
          <Stat label="SO₂" value={r0(A.current.so2)} unit="µg/m³" />
          <Stat label="Ozone" value={r0(A.current.o3)} unit="µg/m³" />
          <Stat label="CO" value={r0(A.current.co)} unit="µg/m³" />
          <Stat label="Dust" value={r0(A.current.dust)} unit="µg/m³" />
          <Stat
            label="Aerosol depth"
            value={A.current.aod.toFixed(2)}
            sub={A.current.aod > 0.8 ? "Very hazy" : A.current.aod > 0.4 ? "Hazy" : "Clean"}
          />
        </div>
        <div className="mt-3">
          <Legend
            items={[
              [VIZ.s7, "PM2.5"],
              [VIZ.s4, "PM10"],
            ]}
          />
          <ResponsiveContainer width="100%" height={150}>
            <LineChart data={aqData} margin={{ left: -14, right: 14, top: 4 }}>
              <CartesianGrid stroke={VIZ.grid} vertical={false} />
              <XAxis dataKey="t" tick={VIZ.axis} interval={11} tickLine={false} axisLine={false} />
              <YAxis tick={VIZ.axis} tickLine={false} axisLine={false} />
              <ReferenceLine
                y={60}
                stroke={LEVEL_COLOR.yellow}
                strokeDasharray="3 3"
                label={{
                  value: "PM2.5 NAAQS 60",
                  fontSize: 9,
                  fill: "#a16207",
                  position: "insideTopRight",
                }}
              />
              <Tooltip content={<ChartTip fmt={(v) => `${v} µg/m³`} />} />
              <Line dataKey="pm25" name="PM2.5" stroke={VIZ.s7} strokeWidth={2} dot={false} />
              <Line dataKey="pm10" name="PM10" stroke={VIZ.s4} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Section>
      <Section title="River discharge (m³/s)" src={p.sources.flood}>
        <Legend
          items={[
            [VIZ.s1, "Discharge"],
            [LEVEL_COLOR.yellow, "90th pct", "dash"],
            [LEVEL_COLOR.red, "99th pct", "dash"],
          ]}
        />
        <ResponsiveContainer width="100%" height={150}>
          <ComposedChart data={fData} margin={{ left: -6, right: 14, top: 4 }}>
            <CartesianGrid stroke={VIZ.grid} vertical={false} />
            <XAxis dataKey="t" tick={VIZ.axis} interval={6} tickLine={false} axisLine={false} />
            <YAxis
              tick={VIZ.axis}
              tickLine={false}
              axisLine={false}
              domain={[0, (mx: number) => Math.ceil(Math.max(mx, F.p99 * 1.05))]}
            />
            <ReferenceLine
              x={fmtDay(nowKey)}
              stroke="currentColor"
              strokeOpacity={0.4}
              label={{
                value: "today",
                fontSize: 9,
                fill: "currentColor",
                position: "insideTopLeft",
              }}
            />
            <ReferenceLine y={F.p90} stroke={LEVEL_COLOR.yellow} strokeDasharray="4 3" />
            <ReferenceLine y={F.p99} stroke={LEVEL_COLOR.red} strokeDasharray="4 3" />
            <Tooltip content={<ChartTip fmt={(v) => `${v} m³/s`} />} />
            <Area
              dataKey="q"
              name="Discharge"
              stroke={VIZ.s1}
              fill={VIZ.s1}
              fillOpacity={0.15}
              strokeWidth={2}
            />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="text-[11px] text-muted-foreground">
          Nearest river reach in the GloFAS network. Median flow {r0(F.p50)} m³/s.
        </p>
      </Section>
      <Section
        title="Drought monitor — last 90 days"
        src={p.sources.recent}
        right={<span className="text-[11px] font-medium">{spi.category}</span>}
      >
        <div className="mb-2 grid grid-cols-3 gap-2">
          <Stat label="Observed" value={r0(spi.observed)} unit="mm" />
          <Stat label="Normal" value={r0(spi.normal)} unit="mm" />
          <Stat
            label="SPI-90"
            value={spi.z}
            sub={`${spi.pct}% of normal`}
            tone={spi.z <= -1 ? LEVEL_COLOR.orange : spi.z >= 1 ? VIZ.s1 : undefined}
          />
        </div>
        <Legend
          items={[
            [VIZ.s1, "Observed cumulative"],
            ["#94a3b8", "Normal cumulative", "dash"],
          ]}
        />
        <ResponsiveContainer width="100%" height={130}>
          <LineChart data={cum} margin={{ left: -14, right: 14, top: 4 }}>
            <CartesianGrid stroke={VIZ.grid} vertical={false} />
            <XAxis dataKey="t" tick={VIZ.axis} interval={14} tickLine={false} axisLine={false} />
            <YAxis tick={VIZ.axis} tickLine={false} axisLine={false} />
            <Tooltip content={<ChartTip fmt={(v) => `${v} mm`} />} />
            <Line dataKey="obs" name="Observed" stroke={VIZ.s1} strokeWidth={2} dot={false} />
            <Line
              dataKey="normal"
              name="Normal"
              stroke="#94a3b8"
              strokeWidth={2}
              strokeDasharray="4 3"
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </Section>
      <Section title="Sea state" src={p.sources.marine}>
        {M.coastal ? (
          <div className="grid grid-cols-7 gap-1 text-center">
            {M.time.map((t, k) => (
              <div key={t} className="rounded-xl bg-foreground/[0.035] p-2">
                <p className="text-[10px] text-muted-foreground">{fmtDay(t).split(" ")[0]}</p>
                <p
                  className="font-mono text-sm font-semibold"
                  style={{ color: M.waveMax[k] >= 2.5 ? LEVEL_COLOR.orange : undefined }}
                >
                  {M.waveMax[k].toFixed(1)}m
                </p>
                <p className="text-[9px] text-muted-foreground">swell {M.swellMax[k].toFixed(1)}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Inland location ({p.meta.coastKm} km from the sea), so sea state doesn't apply.
          </p>
        )}
      </Section>
    </div>
  );
}

/* ================= Alerts ================= */
export function AlertsTab({ alerts }: { alerts: Alert[] }) {
  if (!alerts.length)
    return (
      <div className="rounded-2xl bg-emerald-500/10 p-4 text-sm">
        <LevelPill level="green">Green</LevelPill>
        <p className="mt-2">No hazards above warning thresholds in the next 48 hours to 5 days.</p>
      </div>
    );
  return (
    <div className="space-y-2">
      {alerts.map((a) => (
        <div
          key={a.id}
          className="relative overflow-hidden rounded-2xl border border-border/60 p-4 pl-5"
        >
          <span
            className="absolute left-0 top-0 h-full w-1.5"
            style={{ background: LEVEL_COLOR[a.level] }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <LevelPill level={a.level}>
              {a.level} · {LEVEL_LABEL[a.level]}
            </LevelPill>
            <span className="text-sm font-semibold">{a.hazard}</span>
            {a.simulated && <SourceTag src="synthetic" />}
            <span className="ml-auto text-[11px] font-mono text-muted-foreground">{a.when}</span>
          </div>
          <p className="mt-1.5 text-sm font-medium">{a.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{a.detail}</p>
          <p className="mt-2 text-xs">
            <span className="font-semibold">What to do: </span>
            {a.advice}
          </p>
        </div>
      ))}
    </div>
  );
}
