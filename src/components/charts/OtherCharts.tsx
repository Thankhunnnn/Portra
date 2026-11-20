"use client";
import { useUi } from "@/components/shell/ui-context";
import { useChartMotion } from "@/components/charts/useChartMotion";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { usePortfolio, type Holding } from "@/context/portfolio";
import { fmtMoney, fmtPct } from "@/lib/utils";
import { AXIS, CURSOR, ChartTooltip, GRID } from "./ChartTooltip";

const GAIN = "#2ecc8f";
const LOSS = "#ff5d6c";
export const PALETTE = ["#7c4dff", "#4cc9f0", "#2ecc8f", "#f5a524", "#ff5d6c", "#c77dff", "#90be6d", "#f9844a", "#43aa8b", "#a0aec0"];

export function HoldingsGainChart({ holdings, measure }: { holdings: Holding[]; measure: "value" | "pct" | "price" }) {
  const { hideHomeValues } = useUi();
  const { currency, cv } = usePortfolio();
  const data = holdings
    .map((h) => ({
      name: h.ticker,
      v: measure === "value" ? cv(h.unrGain) : measure === "pct" ? h.unrGainPct : h.dayGainPct,
      value: cv(h.value), unr: cv(h.unrGain), pct: h.unrGainPct,
    }))
    .sort((a, b) => b.v - a.v);
  const fmt = (v: number) => (measure === "value" ? (hideHomeValues ? "••••" : fmtMoney(v, currency)) : fmtPct(v));
  return (
    <div className="h-[260px]" aria-label="Holdings gain chart">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="name" {...AXIS} />
          <YAxis {...AXIS} width={52} tick={hideHomeValues && measure === "value" ? false : undefined} tickFormatter={(v) => (measure === "value" ? fmtMoney(v, currency, true) : fmtPct(v, 0, false))} />
          <ReferenceLine y={0} stroke="#aeb4c2" />
          <Tooltip
            cursor={{ fill: "#ffffff10" }}
            content={(p) => (
              <ChartTooltip {...p} build={(label, payload) => {
                const d = payload[0].payload as (typeof data)[number];
                return {
                  title: String(label),
                  rows: [
                    { name: "Market Value", color: "#7c4dff", value: hideHomeValues ? "••••" : fmtMoney(d.value, currency) },
                    { name: "Unr. Gain", color: d.unr >= 0 ? GAIN : LOSS, value: hideHomeValues ? "••••" : fmtMoney(d.unr, currency) },
                    { name: measure === "price" ? "1D %" : "Unr. Gain %", color: d.v >= 0 ? GAIN : LOSS, value: measure === "price" ? fmtPct(d.v) : fmtPct(d.pct) },
                  ],
                };
              }} />
            )}
          />
          <Bar dataKey="v" radius={[3, 3, 0, 0]} isAnimationActive={false}>
            {data.map((d) => <Cell key={d.name} fill={d.v >= 0 ? GAIN : LOSS} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <span className="sr-only">{data.map((d) => `${d.name} ${fmt(d.v)}`).join(", ")}</span>
    </div>
  );
}

export interface Slice { name: string; value: number }

export function AllocationDonut({ data, label, showLabels = false }: { data: Slice[]; label: string; showLabels?: boolean }) {
  const animate = useChartMotion();
  const { hideHomeValues } = useUi();
  const { currency } = usePortfolio();
  const total = data.reduce((s, d) => s + Math.abs(d.value), 0);
  let angle = 0;
  const labels = data.map((slice, index) => {
    const fraction = total ? Math.abs(slice.value) / total : 0;
    const middle = angle + fraction * Math.PI;
    angle += fraction * 2 * Math.PI;
    return { name: slice.name, index, fraction, x: Math.cos(middle), y: -Math.sin(middle) };
  });
  const left = labels.filter((entry) => entry.x < 0).sort((a, b) => a.y - b.y);
  const right = labels.filter((entry) => entry.x >= 0).sort((a, b) => a.y - b.y);
  const height = showLabels ? Math.max(340, Math.max(left.length, right.length) * 19 + 65) : 300;
  return (
    <div style={{ height }} aria-label="Allocation chart">
      <ResponsiveContainer>
        <PieChart>
          <Pie data={data.map((d) => ({ ...d, abs: Math.abs(d.value) }))} dataKey="abs" nameKey="name"
            startAngle={0} endAngle={360} innerRadius={showLabels ? "30%" : "58%"} outerRadius={showLabels ? "48%" : "88%"}
            paddingAngle={showLabels ? 0 : 1} stroke="#161a22" isAnimationActive={animate && !showLabels} animationDuration={420} animationEasing="ease-out"
            labelLine={false}
            label={showLabels ? ({ cx, cy, outerRadius, index }) => {
              const entry = labels[index];
              if (!entry || !entry.fraction) return <g />;
              const side = entry.x < 0 ? -1 : 1;
              const lane = side < 0 ? left : right;
              const radius = Number(outerRadius);
              const centerX = Number(cx);
              const centerY = Number(cy);
              const startX = centerX + entry.x * radius;
              const startY = centerY + entry.y * radius;
              const elbowX = centerX + side * (radius + 9);
              const textX = elbowX + side * 6;
              const labelY = centerY + (lane.indexOf(entry) - (lane.length - 1) / 2) * Math.max(18, Math.min(26, radius * 2 / lane.length));
              const percent = fmtPct(entry.fraction, 1, false);
              const room = Math.max(2, Math.floor((centerX - radius - 22) / 6) - percent.length - 2);
              const name = entry.name.length > room ? entry.name.slice(0, room - 1) + "…" : entry.name;
              return <g className={animate ? "donut-label-enter" : undefined}>
                <title>{entry.name} · {percent}</title>
                <path d={`M${startX},${startY} L${elbowX},${labelY} H${textX}`}
                  fill="none" stroke={PALETTE[index % PALETTE.length]} strokeOpacity={0.8} />
                <text x={textX + side * 3} y={labelY} textAnchor={side < 0 ? "end" : "start"} dominantBaseline="central" fontSize={10} fill="#f3f4f6">
                  {name} · {percent}
                </text>
              </g>;
            } : undefined}
          >
            {data.map((d, i) => <Cell key={d.name} fill={PALETTE[i % PALETTE.length]} />)}
          </Pie>
          <Tooltip
            content={(p) => (
              <ChartTooltip {...p} build={(_l, payload) => {
                const d = payload[0].payload as Slice & { abs: number };
                return {
                  title: d.name,
                  rows: [
                    { name: label, color: payload[0].payload.fill ?? "#7c4dff", value: hideHomeValues ? "••••" : fmtMoney(d.value, currency) },
                    { name: "Share", color: "#79808f", value: fmtPct(total ? d.abs / total : 0, 1, false) },
                  ],
                };
              }} />
            )}
          />
          <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: 12, color: "#aeb4c2" }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PeriodReturnChart({ rows }: { rows: { period: string; portfolio: number; benchmark: number }[] }) {
  return (
    <div className="h-[280px]" aria-label="Historical return chart">
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="period" {...AXIS} minTickGap={20} />
          <YAxis {...AXIS} width={48} tickFormatter={(v) => fmtPct(v, 0, false)} />
          <ReferenceLine y={0} stroke="#aeb4c2" />
          <Tooltip
            cursor={{ fill: "#ffffff10" }}
            content={(p) => (
              <ChartTooltip {...p} build={(label, payload) => {
                const d = payload[0].payload as (typeof rows)[number];
                return {
                  title: String(label),
                  rows: [
                    { name: "My Portfolio", color: "#7c4dff", value: fmtPct(d.portfolio) },
                    { name: "S&P500", color: "#868686", value: fmtPct(d.benchmark) },
                    { name: "vs benchmark", color: d.portfolio - d.benchmark >= 0 ? GAIN : LOSS, value: fmtPct(d.portfolio - d.benchmark) },
                  ],
                };
              }} />
            )}
          />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: "#aeb4c2" }} />
          <Bar dataKey="portfolio" name="My Portfolio" fill="#7c4dff" radius={[3, 3, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="benchmark" name="S&P500" fill="#868686" radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export { CURSOR };
