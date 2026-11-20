"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, RefreshCw, Settings } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useUi } from "@/components/shell/ui-context";
import { usePortfolio } from "@/context/portfolio";
import { fetchSheetGids, sheetUrl } from "@/lib/sheets";
import { getStoredToken } from "@/lib/firebase";

export function ManageSheetDialog({ open, onOpenChange, ticker }: { open: boolean; onOpenChange: (o: boolean) => void; ticker?: string }) {
  const { hideHomeValues } = useUi();
  const { settings, saveSettings, refresh, loading, mode, allTxns } = usePortfolio();
  const [gids, setGids] = useState<Record<string, number>>({});
  const [id, setId] = useState(settings.sheetId);

  useEffect(() => { setId(settings.sheetId); }, [settings.sheetId, open]);
  useEffect(() => {
    const t = getStoredToken();
    if (open && mode === "live" && t) fetchSheetGids(t, settings.sheetId).then(setGids).catch(() => {});
  }, [open, mode, settings.sheetId]);

  const link = (tab: string) => (mode === "live" ? sheetUrl(settings.sheetId, gids[tab]) : undefined);
  const changed = id.trim() && id.trim() !== settings.sheetId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <div className="p-6">
          <div className="text-xs font-mono uppercase tracking-wide text-mute">Step 1 of 2</div>
          <DialogTitle className="mt-1 text-xl font-normal">Manage Transactions{ticker ? ` · ${ticker}` : ""}</DialogTitle>
          <DialogDescription className="mt-2 text-sm text-sub">
            Transactions live in your Google Sheet. Add a row in the matching tab, then Sync to reload.
          </DialogDescription>

          <ul className="mt-5 divide-y divide-line rounded-xl border border-line">
            {Object.entries(settings.txTabs).map(([a, tab]) => {
              const href = link(tab);
              return (
                <li key={a} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{a}</div>
                    <div className="truncate text-xs text-mute">{tab} · <span className="num">{hideHomeValues ? "••••" : allTxns.filter((t) => t.account === a).length}</span> rows</div>
                  </div>
                  <Button variant="secondary" size="sm" disabled={loading} onClick={() => void refresh()}>
                    <RefreshCw size={13} className={loading ? "animate-spin" : ""} />Sync
                  </Button>
                  {href ? (
                    <Button variant="outline" size="sm" asChild>
                      <a href={href} target="_blank" rel="noreferrer"><ExternalLink size={13} />Open sheet</a>
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" disabled title="Sign in with Google to open your sheet"><ExternalLink size={13} />Open sheet</Button>
                  )}
                </li>
              );
            })}
          </ul>

          <label className="mt-5 block text-xs text-mute" htmlFor="sheet-id">Connected Sheet ID</label>
          <div className="mt-1 flex gap-2">
            <input
              id="sheet-id"
              value={id}
              onChange={(e) => setId(e.target.value)}
              className="num h-9 min-w-0 flex-1 rounded-lg border border-line bg-header px-3 text-xs text-fg outline-none focus:border-brand"
            />
            <Button variant="secondary" disabled={!changed} onClick={() => saveSettings({ ...settings, sheetId: id.trim() })}>Switch</Button>
          </div>

          <div className="mt-6 flex items-center justify-between">
            <Button variant="ghost" size="sm" asChild onClick={() => onOpenChange(false)}>
              <Link href="/settings"><Settings size={14} />Settings</Link>
            </Button>
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
