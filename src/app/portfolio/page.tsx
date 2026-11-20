"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { usePortfolio } from "@/context/portfolio";
import { ValueChart } from "@/components/charts/ValueChart";
import { AllocationDonut, HoldingsGainChart } from "@/components/charts/OtherCharts";
import { HoldingsTable } from "@/components/HoldingsTable";
import { AccountCards, SummaryHeader, SummaryTabs } from "@/components/Summary";
import { Segmented } from "@/components/ui/segmented";

type Measure = "value" | "pct" | "price";
const measures: { value: Measure; label: string }[] = [
  { value: "value", label: "Gain (Value)" },
  { value: "pct", label: "Gain (%)" },
  { value: "price", label: "Price (%)" },
];
const groups = ["Sector", "Theme"] as const;

export default function Home() {
  const { holdings, cv } = usePortfolio();
  const [measure, setMeasure] = useState<Measure>("value");
  const [group, setGroup] = useState<(typeof groups)[number]>("Sector");
  const allocation = useMemo(() => {
    const values = new Map<string, number>();
    for (const holding of holdings) {
      const key = (group === "Sector" ? holding.sector : holding.theme) || "Other";
      values.set(key, (values.get(key) ?? 0) + holding.value);
    }
    return [...values].filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value: cv(value) }));
  }, [holdings, group, cv]);

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <SummaryHeader home />
        <SummaryTabs compact />
      </div>
      <ValueChart />
      <AccountCards />
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section id="holdings" className="min-w-0 rounded-2xl bg-card p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold tracking-tight">My Holdings</h2>
            <Segmented value={measure} onChange={setMeasure} options={measures} label="Holdings chart measure" />
          </div>
          <HoldingsGainChart holdings={holdings} measure={measure} />
          <HoldingsTable holdings={holdings} className="mt-4" />
        </section>
        <section className="min-w-0 rounded-2xl bg-card p-4 sm:p-5" aria-labelledby="holdings-allocation">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 id="holdings-allocation" className="font-semibold">Sector &amp; Theme</h2>
            <Link href="/allocation" className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">Allocation <ArrowUpRight size={14} /></Link>
          </div>
          <Segmented value={group} onChange={setGroup} options={groups} label="Holdings allocation group" />
          {allocation.length ? <AllocationDonut data={allocation} label="Market value" /> : <p className="py-12 text-center text-sm text-mute">No holdings to chart</p>}
        </section>
      </div>
    </div>
  );
}
