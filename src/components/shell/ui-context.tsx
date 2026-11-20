"use client";
import { createContext, useContext } from "react";

export interface UiCtx {
  hideHomeValues: boolean;
  toggleHomeValues: () => void;
  openManage: () => void;
  openTicker: (t: string) => void;
}
export const UiContext = createContext<UiCtx>({ hideHomeValues: false, toggleHomeValues: () => {}, openManage: () => {}, openTicker: () => {} });
export const useUi = () => useContext(UiContext);

export const NAV_MAIN = [
  { href: "/portfolio", label: "Home", icon: "home" },
  { href: "/performance", label: "Performance", icon: "perf" },
  { href: "/allocation", label: "Allocation", icon: "alloc" },
  { href: "/dividends", label: "Dividends", icon: "div" },
  { href: "/risk", label: "Risk", icon: "risk" },
] as const;
export const NAV_TOOLS = [
  { href: "/goal-tracker", label: "Goal Tracker", icon: "goal" },
  { href: "/trade-analysis", label: "Trade Analysis", icon: "trade" },
  { href: "/rebalance", label: "Rebalance", icon: "reb" },
] as const;
export const NAV_MANAGE = [
  { href: "/transactions", label: "Transactions", icon: "tx" },
  { href: "/custom-assets", label: "Custom Assets", icon: "assets" },
  { href: "/settings", label: "Settings", icon: "settings" },
] as const;
