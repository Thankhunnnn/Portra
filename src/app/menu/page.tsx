"use client";
import Link from "next/link";
import { LogOut, ChevronRight } from "lucide-react";
import { usePortfolio } from "@/context/portfolio";
import { ICONS } from "@/components/shell/Nav";
import { NAV_MAIN, NAV_MANAGE, NAV_TOOLS } from "@/components/shell/ui-context";

export default function Menu() {
  const { signOut, user, mode } = usePortfolio();
  const all = [...NAV_MAIN, ...NAV_TOOLS, ...NAV_MANAGE];
  return (
    <div className="max-w-xl space-y-5">
      <h1 className="text-xl font-normal">Menu</h1>
      <div className="rounded-2xl bg-card px-4 py-3 text-sm text-sub">{user?.email ?? (mode === "demo" ? "Demo mode" : "")}</div>
      <section>
        <h2 className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-mute">All reports</h2>
        <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-card">
          {all.map((i) => {
            const Icon = ICONS[i.icon];
            return (
              <li key={i.href}>
                <Link href={i.href} className="flex h-12 items-center gap-3 px-4 text-sm hover:bg-seg/40"><Icon size={18} className="text-sub" />{i.label}<ChevronRight size={16} className="ml-auto text-mute" /></Link>
              </li>
            );
          })}
        </ul>
      </section>
      <button onClick={() => void signOut()} className="flex h-12 w-full items-center gap-3 rounded-2xl bg-card px-4 text-sm text-loss"><LogOut size={18} />Log out</button>
    </div>
  );
}
