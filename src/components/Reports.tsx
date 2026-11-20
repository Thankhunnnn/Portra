"use client";
import { useChartMotion } from "@/components/charts/useChartMotion";

import type { ReactNode } from "react";
import { Area, Bar, Brush, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS, ChartTooltip, GRID } from "@/components/charts/ChartTooltip";

export const controlClass = "min-h-9 rounded-lg border border-line bg-header px-3 text-sm text-fg";
export const panelClass = "min-w-0 rounded-2xl border border-line bg-card p-4 md:p-5";

export function Metrics({ items }: { items: { label: string; value: ReactNode; detail?: string }[] }) {
  return <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
    {items.map(({ label, value, detail }) => (
      <div key={label} className="rounded-xl border border-line bg-header p-3 md:p-4">
        <dt className="text-xs font-medium text-sub">{label}</dt>
        <dd className="num mt-2 text-lg font-semibold md:text-2xl">{value}</dd>
        {detail && <dd className="mt-1 text-xs text-mute">{detail}</dd>}
      </div>
    ))}
  </dl>;
}

export function DataTable({ headings, children }: { headings: string[]; children: ReactNode }) {
  return <div className="mt-3 overflow-auto rounded-xl border border-line">
    <table className="w-full whitespace-nowrap text-left text-sm [&_td]:px-3 [&_td]:py-2.5 [&_tr]:border-b [&_tr]:border-line">
      <thead className="bg-header text-xs text-sub">
        <tr>{headings.map((heading) => <th scope="col" className="px-3 py-3 font-medium" key={heading}>{heading}</th>)}</tr>
      </thead>
      <tbody className="num">{children}</tbody>
    </table>
  </div>;
}

export type ChartSeries = { key: string; name: string; color: string; kind?: "area" | "bar" };
export function ReportChart<T extends { date: string }>({ data, series, format, label, brush = true, marker, details }: {
  data: T[];
  series: ChartSeries[];
  format: (value: number) => string;
  label: string;
  brush?: boolean;
  details?: (point: T) => { name: string; color: string; value: string }[];
  marker?: (point: { cx: number; cy: number; payload: T }) => React.ReactElement<SVGElement>;
}) {
  const animate = useChartMotion();
  if (!data.length) return <p className="py-20 text-center text-sm text-mute">No data for this selection</p>;
  return <>
    <div className="my-3 flex flex-wrap gap-4 text-xs text-sub">
      {series.map(({ key, name, color }) => <span key={key} className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />{name}
      </span>)}
    </div>
    <div className="h-[290px] md:h-[355px]" aria-label={label}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 12, right: 4, bottom: 4, left: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis {...AXIS} dataKey="date" minTickGap={35} tickFormatter={(date: string) => date.length === 10 ? date.slice(0, 7) : date} />
          <YAxis {...AXIS} width={75} tickFormatter={format} domain={["auto", "auto"]} />
          <Tooltip content={(props) => <ChartTooltip {...props} build={(date, payload) => ({
            title: String(date),
            rows: [
              ...series.flatMap(({ key, name, color }) => {
                const value = payload.find((item) => item.dataKey === key)?.value;
                return typeof value === "number" && Number.isFinite(value) ? [{ name, color, value: format(value) }] : [];
              }),
              ...(details && payload[0]?.payload ? details(payload[0].payload as T) : []),
            ],
          })} />} />
          {series.map(({ key, color, kind }) => kind === "area"
            ? <Area key={key} dataKey={key} stroke={color} fill={color} fillOpacity={0.15} dot={false} isAnimationActive={animate} animationDuration={420} animationEasing="ease-out" />
            : kind === "bar"
              ? <Bar key={key} dataKey={key} fill={color} radius={[3, 3, 0, 0]} isAnimationActive={animate} animationDuration={420} animationEasing="ease-out" />
              : <Line key={key} dataKey={key} stroke={color} strokeWidth={2} dot={marker ?? false} isAnimationActive={animate} animationDuration={420} animationEasing="ease-out" />)}
          {brush && data.length > 2 && <Brush dataKey="date" height={25} stroke="#666293" fill="#20203a" tickFormatter={() => ""} />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  </>;
}
