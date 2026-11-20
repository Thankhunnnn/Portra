"use client";
import { useMemo, useState } from "react";
import { usePortfolio } from "@/context/portfolio";
import { AllocationDonut } from "@/components/charts/OtherCharts";
import { HoldingsTable } from "@/components/HoldingsTable";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { fmtMoney, fmtPct } from "@/lib/utils";

const GROUPS = ["Sector", "Theme", "Ticker", "Account"] as const;
const MEASURES = ["Share", "Market Value", "Cost", "Gain", "Loss"] as const;

export default function Allocation() {
  const { holdings, dashboard, account, cashUsd, netWorthUsd, cv, currency } = usePortfolio();
  const [group, setGroup] = useState<(typeof GROUPS)[number]>("Sector");
  const [showLabels, setShowLabels] = useState(false);
  const [measure, setMeasure] = useState<(typeof MEASURES)[number]>("Share");

  const data = useMemo(() => {
    // Prefer the sheet's own allocation tables for the combined view with Share / Market Value
    const sheet = group === "Sector" ? dashboard.sectors : group === "Theme" ? dashboard.themes : [];
    if (account === "All" && sheet.length && (measure === "Share" || measure === "Market Value"))
      return sheet.map((s) => ({ name: s.name, value: cv(s.value) }));
    const map = new Map<string, number>();
    for (const h of holdings) {
      const names = group === "Account" ? h.accounts : [group === "Sector" ? h.sector : group === "Theme" ? h.theme : h.ticker];
      const v = measure === "Cost" ? h.cost : measure === "Gain" ? Math.max(0, h.unrGain) : measure === "Loss" ? Math.max(0, -h.unrGain) : h.value;
      names.forEach((n) => map.set(n, (map.get(n) ?? 0) + v / names.length));
    }
    return [...map.entries()].map(([name, v]) => ({ name, value: cv(v) })).filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  }, [holdings, dashboard, group, measure, account, cv]);

  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="space-y-5">
      <section className="rounded-2xl bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <Segmented value={measure} onChange={setMeasure} options={MEASURES} className="max-w-full flex-wrap" label="Measure" />
          <Segmented value={group} onChange={setGroup} options={GROUPS} className="max-w-full flex-wrap" label="Group by" />
          <Button variant="outline" size="sm" aria-pressed={showLabels} onClick={() => setShowLabels((show) => !show)}>{showLabels ? "Hide labels and %" : "Show labels and %"}</Button>
        </div>
        <div className="grid items-center gap-4 md:grid-cols-[1fr_1fr]">
          <AllocationDonut showLabels={showLabels} data={data} label={measure === "Share" ? "Market Value" : measure} />
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-3">
              {[
                ["Portfolio Value", fmtMoney(cv(netWorthUsd), currency)],
                ["Number of holdings", String(holdings.length)],
                ["Cash on hand", fmtMoney(cv(cashUsd), currency)],
                ["Cash (% of portfolio)", fmtPct(netWorthUsd ? cashUsd / netWorthUsd : 0, 1, false)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-header px-3 py-2.5">
                  <dt className="text-[11px] text-mute">{k}</dt>
                  <dd className="num text-lg">{v}</dd>
                </div>
              ))}
            </dl>
            <ul className="divide-y divide-line/60 text-sm">
              {data.map((d) => (
                <li key={d.name} className="flex justify-between py-1.5">
                  <span>{d.name}</span>
                  <span className="num text-sub">{fmtPct(total ? d.value / total : 0, 1, false)} · {fmtMoney(d.value, currency)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
      <section className="rounded-2xl bg-card p-4">
        <HoldingsTable holdings={holdings} />
      </section>
    </div>
  );
}
