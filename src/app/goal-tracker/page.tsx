"use client";

import { useEffect, useState } from "react";
import { usePortfolio } from "@/context/portfolio";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { controlClass, DataTable, Metrics, panelClass, ReportChart } from "@/components/Reports";
import { PERIODS, periodStart, type Period } from "@/components/charts/ValueChart";
import { addMonths, todayInBangkok } from "@/lib/reportDates";
import { fmtMoney, fmtPct } from "@/lib/utils";

type Plan = { start: string; years: number; value: number; annual: number; contribution: number; every: number; growth: number; growthEvery: number };
type Projection = ReturnType<typeof project>[number];
const columns = ["Value", "Contribution", "Gross contribution", "Return", "Cumulative return"] as const;
const scopes = ["All", "This month", "This year"] as const;
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function project(plan: Plan) {
  const rate = (1 + plan.annual / 100) ** (1 / 12) - 1;
  let goal = plan.value;
  let deposits = plan.value;
  let cumulativeReturn = 0;
  return Array.from({ length: plan.years * 12 + 1 }, (_, month) => {
    const contribution = month > 0 && month % plan.every === 0
      ? plan.contribution * (1 + plan.growth / 100) ** Math.floor((month - 1) / plan.growthEvery)
      : 0;
    const growth = month ? goal * rate : 0;
    goal += growth + contribution;
    deposits += contribution;
    cumulativeReturn += growth;
    return { date: addMonths(plan.start, month), goal, deposits, contribution, growth, cumulativeReturn };
  });
}

export default function GoalTracker() {
  const { mode, account, settings, netWorthUsd, nav, cv, currency, usdThb } = usePortfolio();
  return <GoalPlan key={JSON.stringify([mode, settings.sheetId, account])}
    storageKey={JSON.stringify(["portra.goal", mode, settings.sheetId, account])}
    current={netWorthUsd} nav={nav} currency={currency} cv={cv} usdThb={usdThb} />;
}

function GoalPlan({ storageKey, current, nav, currency, cv, usdThb }: {
  storageKey: string; current: number; nav: { date: string; nav: number }[];
  currency: "USD" | "THB"; cv: (value: number) => number; usdThb: number;
}) {
  const today = todayInBangkok();
  const defaults: Plan = { start: today, years: 4, value: Math.max(0, current), annual: 8, contribution: 0, every: 1, growth: 0, growthEvery: 12 };
  const [saved, setSaved] = useState<Plan>();
  const [draft, setDraft] = useState<Plan>();
  const [preview, setPreview] = useState<Plan>();
  const [error, setError] = useState("");
  const [period, setPeriod] = useState<Period>("All");
  const [scope, setScope] = useState<(typeof scopes)[number]>("All");
  const [column, setColumn] = useState<(typeof columns)[number]>("Value");
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setSaved(JSON.parse(raw));
    } catch {}
  }, [storageKey]);

  const plan = preview ?? saved ?? defaults;
  const projection = project(plan);
  const last = projection.at(-1)!;
  const cutoff = scope === "This month" ? today.slice(0, 7) + "-31" : today.slice(0, 4) + "-12-31";
  const target = scope === "All" ? last : projection.filter((point) => point.date <= cutoff).at(-1);
  const progress = target && target.goal > 0 ? current / target.goal : NaN;
  const money = (value: number) => fmtMoney(cv(value), currency);
  const from = nav.length ? periodStart(period, nav.at(-1)!.date, nav[0].date) : plan.start;
  const chart = new Map<string, { date: string; actual?: number; goal?: number; deposits?: number }>();
  for (const point of nav) if (point.date >= from) chart.set(point.date, { date: point.date, actual: point.nav });
  for (const point of projection) if (point.date >= from) chart.set(point.date, { ...chart.get(point.date), ...point });
  const lastActual = nav.at(-1);
  if (lastActual && plan.start === today && lastActual.date < today) chart.set(today, { ...chart.get(today), date: today, actual: current });
  const years = [...new Set(projection.map(({ date }) => date.slice(0, 4)))];
  const monthly = new Map(projection.map((point) => [point.date.slice(0, 7), point]));
  const values: Record<typeof column, keyof Omit<Projection, "date">> = {
    Value: "goal", Contribution: "contribution", "Gross contribution": "deposits", Return: "growth", "Cumulative return": "cumulativeReturn",
  };

  function commit(save: boolean) {
    if (!draft) return;
    const numbers = [draft.value, draft.contribution, draft.annual, draft.growth];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.start) || !Number.isInteger(draft.years) || draft.years < 1 || draft.years > 50 ||
        !numbers.every(Number.isFinite) || draft.value < 0 || draft.contribution < 0 || draft.annual <= -100 || draft.growth <= -100 ||
        !Number.isFinite(project(draft).at(-1)?.goal)) {
      setError("Enter a start date, a horizon of 1–50 years, valid returns above −100%, and nonnegative amounts.");
      return;
    }
    if (save) {
      try { localStorage.setItem(storageKey, JSON.stringify(draft)); }
      catch { setError("This browser could not save the plan."); return; }
      setSaved(draft);
      setDraft(undefined);
      setPreview(undefined);
    } else setPreview(draft);
    setError("");
  }

  const numberField = (label: string, key: "years" | "value" | "annual" | "contribution" | "growth") => {
    if (!draft) return null;
    const exchange = currency === "THB" && (key === "value" || key === "contribution") ? usdThb : 1;
    return <label className="grid gap-1.5 text-sm text-sub">{label}
      <input className={controlClass} type="number" step={key === "years" ? 1 : "any"}
        value={Number.isFinite(draft[key]) ? Number((draft[key] * exchange).toFixed(6)) : ""}
        onChange={(event) => setDraft({ ...draft, [key]: event.target.valueAsNumber / exchange })} />
    </label>;
  };

  return <div className="space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold">Goal Tracker</h1>
      {!draft && <Button onClick={() => setDraft(saved ?? defaults)}>{saved ? "Edit Plan" : "Create Plan"}</Button>}
    </header>
    {draft ? <form className={panelClass} onSubmit={(event) => { event.preventDefault(); commit(true); }}>
      <h2 className="mb-4 font-semibold">{saved ? "Edit your plan" : "Create your plan"}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1.5 text-sm text-sub">Starting date
          <input className={controlClass} type="date" value={draft.start} onChange={(event) => setDraft({ ...draft, start: event.target.value })} />
        </label>
        {numberField("Time horizon (years)", "years")}
        {numberField(`Starting value (${currency})`, "value")}
        {numberField("Expected annual return (%)", "annual")}
        {numberField(`Additional contribution (${currency})`, "contribution")}
        <label className="grid gap-1.5 text-sm text-sub">Contribution frequency
          <select className={controlClass} value={draft.every} onChange={(event) => setDraft({ ...draft, every: Number(event.target.value) })}>
            <option value={1}>Monthly</option><option value={3}>Quarterly</option><option value={12}>Annually</option>
          </select>
        </label>
        {numberField("Contribution growth (%)", "growth")}
        <label className="grid gap-1.5 text-sm text-sub">Growth frequency
          <select className={controlClass} value={draft.growthEvery} onChange={(event) => setDraft({ ...draft, growthEvery: Number(event.target.value) })}>
            <option value={12}>Year over year</option><option value={3}>Quarter over quarter</option><option value={1}>Month over month</option>
          </select>
        </label>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-loss">{error}</p>}
      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <p className="mr-auto text-sm text-sub">End value <strong className="num ml-2 text-lg text-fg">{money(last.goal)}</strong></p>
        <Button type="button" variant="outline" onClick={() => { setDraft(undefined); setPreview(undefined); setError(""); }}>Cancel</Button>
        <Button type="button" variant="secondary" onClick={() => commit(false)}>Calculate</Button>
        <Button type="submit">Save Plan</Button>
      </div>
    </form> : <section className="space-y-3">
      <Segmented label="Goal horizon" options={scopes} value={scope} onChange={setScope} />
      <Metrics items={[
        { label: "Current value", value: money(current) },
        { label: "Progress", value: <>{fmtPct(progress, 1, false)}<progress aria-label="Goal progress" className="mt-2 block h-2 w-full accent-brand" max={1} value={Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0} /></> },
        { label: "Projected goal", value: target ? money(target.goal) : "–", detail: target?.date },
        { label: "Planned contributions", value: target ? money(target.deposits - plan.value) : "–" },
      ]} />
    </section>}
    <section className={panelClass}>
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Portfolio projection</h2>
        <Segmented label="Chart period" options={PERIODS} value={period} onChange={setPeriod} />
      </div>
      <ReportChart key={period} label="Goal projection chart" data={[...chart.values()].sort((a, b) => a.date.localeCompare(b.date))}
        format={money} series={[
          { key: "deposits", name: "Planned deposits", color: "#8580ac", kind: "area" },
          { key: "goal", name: "Goal", color: "#44d5ac" },
          { key: "actual", name: "Portfolio", color: "#eeeafa" },
        ]} />
    </section>
    <section className={panelClass}>
      <h2 className="mb-3 font-semibold">Monthly projection</h2>
      <Segmented className="max-w-full flex-wrap" label="Projection measure" options={columns} value={column} onChange={setColumn} />
      <DataTable headings={["Year", ...months]}>{years.map((year) => <tr key={year}>
        <td className="font-medium">{year}</td>
        {months.map((month, index) => {
          const row = monthly.get(`${year}-${String(index + 1).padStart(2, "0")}`);
          return <td key={month}>{row ? money(row[values[column]]) : "–"}</td>;
        })}
      </tr>)}</DataTable>
    </section>
  </div>;
}
