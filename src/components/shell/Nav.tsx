"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Home, LineChart, PieChart, Coins, ShieldAlert, Target, BarChart3, Scale, ArrowLeftRight, Boxes, Settings, HelpCircle,
  PanelLeftOpen, PanelLeftClose, Menu, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_MAIN, NAV_MANAGE, NAV_TOOLS } from "./ui-context";

export const ICONS: Record<string, LucideIcon> = {
  home: Home, perf: LineChart, alloc: PieChart, div: Coins, risk: ShieldAlert, goal: Target, trade: BarChart3,
  reb: Scale, tx: ArrowLeftRight, assets: Boxes, settings: Settings, menu: Menu,
};

export function Sidebar() {
  const path = usePathname();
  const [open, setOpen] = useState(true);
  const group = (title: string, items: readonly { href: string; label: string; icon: string }[]) => (
    <div className="mt-4">
      {open ? <div className="px-4 pb-1 font-mono text-[11px] font-semibold uppercase tracking-wider text-mute">{title}</div> : <div className="mx-3 mb-2 h-px bg-line" />}
      {items.map((i) => <Item key={i.href} {...i} />)}
    </div>
  );
  const Item = ({ href, label, icon }: { href: string; label: string; icon: string }) => {
    const Icon = ICONS[icon];
    const active = path === href || (href === "/portfolio" && path === "/") || (href !== "/portfolio" && path.startsWith(href));
    return (
      <Link
        href={href}
        title={label}
        aria-current={active ? "page" : undefined}
        className={cn(
          "mx-2 flex h-10 items-center gap-3 rounded-xl border px-3 text-sm font-medium transition-colors",
          active ? "border-brand/25 bg-brandtint text-fg" : "border-transparent text-sub hover:bg-seg/50 hover:text-fg"
        )}
      >
        <Icon size={18} className={active ? "text-brand" : ""} />
        {open && <span className="truncate">{label}</span>}
      </Link>
    );
  };
  return (
    <aside className={cn("sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line/70 bg-rail transition-[width] md:flex", open ? "w-[200px] lg:w-[236px]" : "w-14")}>
      <Link href="/portfolio" className="mb-3 flex h-16 items-center gap-2 border-b border-line/60 px-3.5" aria-label="Portra home">
        <img src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/icon.svg`} alt="" className="h-7 w-7" />
        {open && <span className="text-base font-semibold tracking-tight">Portra</span>}
      </Link>
      <nav className="flex-1 overflow-y-auto">
        {NAV_MAIN.map((i) => <Item key={i.href} {...i} />)}
        {group("Tools", NAV_TOOLS)}
        {group("Manage", NAV_MANAGE)}
      </nav>
      <Link href="/menu" title="Help" className="mx-2 flex h-10 items-center gap-3 rounded-lg px-3 text-sm text-sub hover:bg-seg/50">
        <HelpCircle size={18} />{open && "Help"}
      </Link>
      <button onClick={() => setOpen(!open)} aria-label={open ? "Collapse sidebar" : "Expand sidebar"} className="m-2 flex h-10 items-center gap-3 rounded-lg px-3 text-sub hover:bg-seg/50 hover:text-fg">
        {open ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}{open && <span className="text-sm">Collapse</span>}
      </button>
    </aside>
  );
}

export function BottomBar() {
  const path = usePathname();
  const items = [...NAV_MAIN.slice(0, 4), NAV_MANAGE[0], { href: "/menu", label: "Menu", icon: "menu" }];
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 flex h-14 items-center justify-around border-t border-line bg-header md:hidden">
      {items.map((i) => {
        const Icon = ICONS[i.icon];
        const active = path === i.href || (i.href === "/portfolio" && path === "/");
        return (
          <Link key={i.href} href={i.href} aria-label={i.label} aria-current={active ? "page" : undefined} className={cn("flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl px-0.5 py-1 text-[9px] sm:text-[11px]", active ? "text-brand" : "text-sub")}>
            <Icon size={18} /><span className="max-w-full truncate">{i.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
