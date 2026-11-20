"use client";
import type { TooltipProps } from "recharts";

export interface TipRow { name: string; color: string; value: string }

/**
 * One tooltip for every chart: bold heading, then colored rows.
 * `build` maps recharts' active payload to heading + rows, so every chart uses identical chrome.
 */
type Payload = NonNullable<TooltipProps<number, string>["payload"]>;
export function ChartTooltip({
  active, payload, label, build,
}: {
  active?: boolean; payload?: unknown; label?: unknown;
  build: (label: unknown, payload: Payload) => { title: string; rows: TipRow[] };
  [k: string]: unknown;
}) {
  return <TipInner active={active} payload={payload as Payload | undefined} label={label} build={build} />;
}

function TipInner({
  active, payload, label, build,
}: { active?: boolean; payload?: Payload; label?: unknown; build: (label: unknown, payload: Payload) => { title: string; rows: TipRow[] } }) {
  if (!active || !payload || payload.length === 0) return null;
  const { title, rows } = build(label, payload);
  return (
    <div className="pointer-events-none min-w-[170px] max-w-[min(28rem,80vw)] rounded-lg border border-line bg-cardwarm/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
      <div className="mb-1.5 font-semibold text-fg">{title}</div>
      {rows.map((r, i) => (
        <div key={i} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-sub">
            <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />{r.name}
          </span>
          <span className="num font-medium text-fg">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export const AXIS = { stroke: "#8a94af", fontSize: 11, tickLine: false, axisLine: false } as const;
export const GRID = "#2a2e43";
export const CURSOR = { stroke: "#8a94af", strokeDasharray: "3 3" };

export function fmtLongDate(d: unknown): string {
  const dt = new Date(String(d) + "T00:00:00Z");
  return dt.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}
