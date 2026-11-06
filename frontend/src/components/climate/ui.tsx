/* eslint-disable @typescript-eslint/no-explicit-any -- parses untyped upstream API JSON */
import type { ReactNode } from "react";
import type { Source } from "@/lib/climate/types";
import type { Level } from "@/lib/climate/analysis";
import { LEVEL_COLOR } from "./hazardIcons";

export function SourceTag({ src, className = "" }: { src: Source; className?: string }) {
  const map = {
    live: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    mixed: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
    synthetic: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  } as const;
  const label = { live: "Live", mixed: "Live + filled", synthetic: "Synthetic" }[src];
  return (
    <span
      title={
        src === "synthetic"
          ? "Modelled value — live source unavailable"
          : src === "mixed"
            ? "Live data with gaps filled by the synthetic model"
            : "Live observed / forecast data"
      }
      className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-mono font-semibold uppercase tracking-wider ${map[src]} ${className}`}
    >
      {label}
    </span>
  );
}

export function LevelPill({ level, children }: { level: Level; children?: ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-widest"
      style={{
        background: `color-mix(in oklab, ${LEVEL_COLOR[level]} 18%, transparent)`,
        color: level === "yellow" ? "#a16207" : LEVEL_COLOR[level],
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: LEVEL_COLOR[level] }} />
      {children ?? level}
    </span>
  );
}

export function Stat({
  label,
  value,
  unit,
  sub,
  tone,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  sub?: ReactNode;
  tone?: string;
}) {
  return (
    <div className="rounded-2xl bg-foreground/[0.035] p-3">
      <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p
        className="mt-1 font-display text-lg font-semibold leading-none"
        style={tone ? { color: tone } : undefined}
      >
        {value}
        {unit && <span className="ml-0.5 text-xs font-normal text-muted-foreground">{unit}</span>}
      </p>
      {sub && <p className="mt-1 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function Section({
  title,
  src,
  children,
  right,
}: {
  title: string;
  src?: Source;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border/60 p-4">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {title}
        </h3>
        {src && <SourceTag src={src} />}
        <div className="ml-auto">{right}</div>
      </div>
      {children}
    </section>
  );
}

/** Shared chart styling (reference palette, validated). */
export const VIZ = {
  s1: "#2a78d6",
  s2: "#eb6834",
  s3: "#1baf7a",
  s4: "#eda100",
  s5: "#e87ba4",
  s7: "#6250d6",
  grid: "color-mix(in oklab, currentColor 10%, transparent)",
  axis: { fontSize: 10, fill: "currentColor", opacity: 0.6 },
};

export function ChartTip({
  active,
  payload,
  label,
  fmt,
}: {
  active?: boolean;
  payload?: any[];
  label?: any;
  fmt?: (v: number, name: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-popover px-3 py-2 text-xs shadow-elevated">
      <p className="mb-1 font-semibold">{label}</p>
      {payload
        .filter(
          (p) => p.value !== undefined && p.value !== null && !String(p.dataKey).startsWith("_"),
        )
        .map((p) => (
          <p key={p.dataKey} className="flex items-center gap-2 text-muted-foreground">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: p.color || p.stroke || p.fill }}
            />
            <span>{p.name}</span>
            <span className="ml-auto font-mono text-foreground">
              {fmt
                ? fmt(Array.isArray(p.value) ? p.value[1] : p.value, p.name)
                : Array.isArray(p.value)
                  ? `${p.value[0]}–${p.value[1]}`
                  : p.value}
            </span>
          </p>
        ))}
    </div>
  );
}
