"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus, RefreshCw, HelpCircle, LogOut, Settings, Palette } from "lucide-react";
import { usePortfolio } from "@/context/portfolio";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Segmented } from "@/components/ui/segmented";
import { type AccountFilter } from "@/lib/sheets";
import { cn } from "@/lib/utils";
import { NAV_MAIN, NAV_MANAGE, NAV_TOOLS, useUi } from "./ui-context";

export function TopBar() {
  const { user, mode, signOut, refresh, loading } = usePortfolio();
  const { openManage } = useUi();
  const path = usePathname();
  const label = [...NAV_MAIN, ...NAV_TOOLS, ...NAV_MANAGE].find(({ href }) => href === path)?.label ?? (path === "/" ? "Home" : "Menu");
  const initial = (user?.displayName ?? (mode === "demo" ? "Demo" : "U")).slice(0, 1).toUpperCase();
  const avatar = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button aria-label="Account" className="grid h-10 w-10 place-items-center rounded-full bg-brandtint font-semibold text-fg">
          {user?.photoURL ? <img src={user.photoURL} alt="" className="h-10 w-10 rounded-full" referrerPolicy="no-referrer" /> : initial}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>{user?.email ?? "Demo mode"}</DropdownMenuLabel>
        <DropdownMenuItem disabled><Palette size={16} />Appearance: Dark</DropdownMenuItem>
        <DropdownMenuItem asChild><Link href="/settings"><Settings size={16} />Portfolio Settings</Link></DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}><LogOut size={16} />Log out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
  return (
    <header className="portra-top-bar sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-line/70 bg-header/90 px-3 backdrop-blur-xl sm:px-5 lg:px-8">
      <div className="flex min-w-0 items-center gap-2"><span className="text-sm font-semibold md:hidden">Portra</span><span className="truncate text-sm text-sub">{label}</span></div>
      <div className="flex items-center gap-1">
        <Button aria-label="Add transaction" onClick={openManage} className="rounded-full bg-indigo-500 text-white hover:bg-indigo-400"><Plus size={17} /><span className="hidden sm:inline">Manage Sheet</span></Button>
        <Button variant="ghost" size="icon" aria-label="Refresh prices" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw size={18} className={cn(loading && "animate-spin")} />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Help" asChild><Link href="/menu"><HelpCircle size={19} /></Link></Button>
        {avatar}
      </div>
    </header>
  );
}

export function ControlsBar() {
  const { hideHomeValues } = useUi();
  const { account, setAccount, currency, setCurrency, lastUpdated, session, refresh, loading, refreshStatus, usdThb, fxSource, mode, portfolios } = usePortfolio();
  return (
    <div className="portra-control-strip flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line/60 px-3 py-3 sm:px-5 lg:px-8">
      <Segmented<AccountFilter> className="max-w-full flex-wrap" label="Account filter" value={account} onChange={setAccount} options={["All", ...portfolios]} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" aria-label="Manage portfolios">•••</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem asChild><Link href="/settings#create-portfolio"><Plus size={16} />Create Portfolio</Link></DropdownMenuItem>
          <DropdownMenuItem asChild><Link href="/settings#portfolios"><Settings size={16} />Portfolio Settings</Link></DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Segmented label="Currency" value={currency} onChange={setCurrency} options={["USD", "THB"] as const} />
      <div className="ml-auto flex flex-wrap items-center gap-2 text-xs text-mute">
        {mode === "demo" && <span className="rounded bg-brandtint px-1.5 py-0.5 font-mono text-[10px] font-semibold text-brand">DEMO</span>}
        <span className="num" title={fxSource}>USD/THB {hideHomeValues ? "••••" : usdThb.toFixed(2)} <span className="font-sans">({fxSource})</span></span>
        <span className="hidden sm:inline">·</span>
        <span>Last updated <span className="num text-sub">{lastUpdated || "—"}</span></span>
        <span
          className={cn(
            "rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide",
            session === "EXTENDED" ? "bg-brand/20 text-brand" : "bg-seg text-sub"
          )}
        >
          {session}
        </span>
        <Button variant="secondary" size="sm" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw size={13} className={cn(loading && "animate-spin")} />{refreshStatus ? "Refreshing…" : "Refresh"}
        </Button>
        {refreshStatus && <span role="status">{refreshStatus}</span>}
      </div>
    </div>
  );
}
