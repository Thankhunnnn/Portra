"use client";
import { useChartMotion } from "@/components/charts/useChartMotion";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { usePortfolio } from "@/context/portfolio";
import { Sidebar, BottomBar } from "./Nav";
import { TopBar, ControlsBar } from "./TopBar";
import { UiContext } from "./ui-context";
import { ManageSheetDialog } from "@/components/ManageSheetDialog";
import { TickerDialog } from "@/components/TickerDialog";
import { LoginGate } from "@/components/LoginGate";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const animate = useChartMotion();
  const { mode, error } = usePortfolio();
  const [hideValues, setHideValues] = useState(false);
  const home = pathname === "/" || pathname === "/portfolio" || pathname === "/portfolio/";
  const [manage, setManage] = useState(false);
  const [ticker, setTicker] = useState<string | null>(null);
  if (mode === "none") return <LoginGate />;
  return (
    <UiContext.Provider value={{ hideHomeValues: home && hideValues, toggleHomeValues: () => setHideValues((hide) => !hide), openManage: () => setManage(true), openTicker: setTicker }}>
      <div className="portra-workspace flex min-h-dvh">
        <Sidebar />
        <div className="portra-content min-w-0 flex-1">
          <TopBar />
          <ControlsBar />
          {error && (
            <div role="alert" className="mx-3 mb-3 rounded-lg border border-loss/40 bg-loss/10 px-4 py-3 text-sm text-loss md:mx-6">{error}</div>
          )}
          <main className="mx-auto w-full max-w-[1480px] px-3 pb-4 pt-3 sm:px-5 lg:px-8"><div key={pathname} className={animate ? "page-enter" : undefined}>{children}</div></main>
        </div>
        <BottomBar />
      </div>
      <TickerDialog ticker={ticker} onClose={() => setTicker(null)} />
      <ManageSheetDialog open={manage} onOpenChange={setManage} ticker={ticker ?? undefined} />
    </UiContext.Provider>
  );
}
