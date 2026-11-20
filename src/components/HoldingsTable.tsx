"use client";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search } from "lucide-react";
import { usePortfolio, type Holding } from "@/context/portfolio";
import { Segmented } from "@/components/ui/segmented";
import { useUi } from "@/components/shell/ui-context";
import { nextSort, sortRows, type SortState } from "@/lib/sort";
import { cn, fmtMoney, fmtNum, fmtPct, gainClass } from "@/lib/utils";

type Key = "ticker" | "allocation" | "last" | "avgCost" | "dayGainPct" | "unrGainPct" | "dayGain" | "unrGain" | "value" | "shares" | "cost";
const COLS: { key: Key; label: string; text?: boolean }[] = [
  { key: "ticker", label: "Ticker", text: true },
  { key: "allocation", label: "Allocation" },
  { key: "last", label: "Last" },
  { key: "avgCost", label: "Avg Cost" },
  { key: "dayGainPct", label: "1D Gain %" },
  { key: "unrGainPct", label: "Unr. Gain %" },
  { key: "dayGain", label: "1D Gain" },
  { key: "unrGain", label: "Unr. Gain" },
  { key: "value", label: "Market Value" },
  { key: "shares", label: "Shares" },
  { key: "cost", label: "Cost" },
];
const PRESETS = {
  Overview: ["ticker", "allocation", "last", "dayGainPct", "unrGainPct", "value", "shares"],
  Cost: ["ticker", "avgCost", "cost", "value", "shares"],
  Gain: ["ticker", "dayGain", "dayGainPct", "unrGain", "unrGainPct", "value"],
  Price: ["ticker", "last", "avgCost", "dayGainPct", "unrGainPct"],
} as const satisfies Record<string, readonly Key[]>;
type Preset = keyof typeof PRESETS;
const DEFAULT_SORT: SortState<Key> = { key: "value", dir: "desc" };

export function HoldingsTable({ holdings, className }: { holdings: Holding[]; className?: string }) {
  const { currency, cv } = usePortfolio();
  const { openTicker, hideHomeValues } = useUi();
  const [preset, setPreset] = useState<Preset>("Overview");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortState<Key>>(DEFAULT_SORT);
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(0);

  const rows = useMemo(() => {
    const f = holdings.filter((h) => h.ticker.toLowerCase().includes(q.trim().toLowerCase()));
    return sortRows(f, sort, (h, k) => (k === "ticker" ? h.ticker : (h[k] as number)));
  }, [holdings, q, sort]);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const cur = Math.min(page, pages - 1);
  const slice = rows.slice(cur * pageSize, cur * pageSize + pageSize);
  const cols = COLS.filter((c) => (PRESETS[preset] as readonly Key[]).includes(c.key));

  const cell = (h: Holding, k: Key) => {
    if (hideHomeValues && k !== "ticker" && k !== "allocation" && k !== "dayGainPct" && k !== "unrGainPct") return "••••";
    switch (k) {
      case "ticker": return <span className="font-semibold">{h.ticker}<span className="ml-2 text-[11px] font-normal text-mute">{h.accounts.join(" · ")}</span></span>;
      case "allocation": return (
        <span className="flex items-center justify-end gap-2">
          <span className="hidden h-1.5 w-12 overflow-hidden rounded bg-seg sm:block"><span className="block h-full bg-brand" style={{ width: `${Math.min(100, h.allocation * 100)}%` }} /></span>
          {fmtPct(h.allocation, 1, false)}
        </span>);
      case "last": return fmtMoney(cv(h.last), currency);
      case "avgCost": return fmtMoney(cv(h.avgCost), currency);
      case "dayGainPct": return <span className={gainClass(h.dayGainPct)}>{fmtPct(h.dayGainPct)}</span>;
      case "unrGainPct": return <span className={gainClass(h.unrGainPct)}>{fmtPct(h.unrGainPct)}</span>;
      case "dayGain": return <span className={gainClass(h.dayGain)}>{fmtMoney(cv(h.dayGain), currency)}</span>;
      case "unrGain": return <span className={gainClass(h.unrGain)}>{fmtMoney(cv(h.unrGain), currency)}</span>;
      case "value": return fmtMoney(cv(h.value), currency);
      case "cost": return fmtMoney(cv(h.cost), currency);
      case "shares": return fmtNum(h.shares, h.shares % 1 ? 4 : 0);
    }
  };

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2 pb-3">
        <Segmented value={preset} onChange={(p) => setPreset(p)} options={Object.keys(PRESETS) as Preset[]} label="Column preset" />
        <label className="relative ml-auto">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(0); }}
            placeholder="Search Ticker"
            aria-label="Search ticker"
            className="h-8 w-40 rounded-lg border border-line bg-header pl-8 pr-2 text-[13px] outline-none placeholder:text-mute focus:border-brand"
          />
        </label>
      </div>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="h-10 border-b border-line text-[13px] text-mute">
              {cols.map((c) => {
                const active = sort.key === c.key;
                const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                    className={cn("whitespace-nowrap px-3 font-medium", c.text ? "sticky left-0 bg-card text-left" : "text-right")}
                  >
                    <button
                      onClick={() => { setSort(nextSort(sort, c.key, DEFAULT_SORT, ["ticker"])); setPage(0); }}
                      className={cn("inline-flex items-center gap-1 hover:text-fg", active && "text-fg")}
                    >
                      {c.label}<Icon size={12} className={active ? "opacity-100" : "opacity-40"} />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {slice.map((h) => (
              <tr key={h.ticker} tabIndex={0} onClick={() => openTicker(h.ticker)} onKeyDown={(e) => e.key === "Enter" && openTicker(h.ticker)}
                className="h-11 cursor-pointer border-b border-line/60 last:border-0 hover:bg-seg/30 focus:bg-seg/30 focus:outline-none">
                {cols.map((c) => (
                  <td key={c.key} className={cn("whitespace-nowrap px-3", c.text ? "sticky left-0 bg-card text-left" : "num text-right")}>{cell(h, c.key)}</td>
                ))}
              </tr>
            ))}
            {slice.length === 0 && <tr><td colSpan={cols.length} className="py-10 text-center text-mute">No holdings</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3 pt-3 text-xs text-mute">
        <label className="flex items-center gap-2">Items per page
          <select value={pageSize} onChange={(e) => { setPageSize(+e.target.value); setPage(0); }} className="h-7 rounded-md border border-line bg-header px-1 text-fg">
            {[10, 25, 50].map((n) => <option key={n}>{n}</option>)}
          </select>
        </label>
        <span className="num">{hideHomeValues ? "••••" : `${rows.length ? cur * pageSize + 1 : 0}–${Math.min(rows.length, (cur + 1) * pageSize)} of ${rows.length}`}</span>
        <div className="flex gap-1">
          {[
            { i: ChevronsLeft, l: "First page", go: () => setPage(0), off: cur === 0 },
            { i: ChevronLeft, l: "Previous page", go: () => setPage(cur - 1), off: cur === 0 },
            { i: ChevronRight, l: "Next page", go: () => setPage(cur + 1), off: cur >= pages - 1 },
            { i: ChevronsRight, l: "Last page", go: () => setPage(pages - 1), off: cur >= pages - 1 },
          ].map(({ i: I, l, go, off }) => (
            <button key={l} aria-label={l} onClick={go} disabled={off} className="grid h-7 w-7 place-items-center rounded-md hover:bg-seg disabled:opacity-30"><I size={15} /></button>
          ))}
        </div>
      </div>
    </div>
  );
}
