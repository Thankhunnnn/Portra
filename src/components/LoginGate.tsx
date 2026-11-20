"use client";
import { usePortfolio } from "@/context/portfolio";
import { Button } from "@/components/ui/button";

export function LoginGate() {
  const { signIn, startDemo, authError } = usePortfolio();
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-card p-8 text-center">
        <img src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/icon.svg`} alt="" className="mx-auto h-14 w-14" />
        <h1 className="mt-4 text-xl font-normal">Portra</h1>
        <p className="mt-2 text-sm text-sub">Sign in with Google to load your own portfolio sheet (read-only access).</p>
        <Button className="mt-6 w-full" onClick={() => void signIn()}>Continue with Google</Button>
        <Button className="mt-2 w-full" variant="ghost" onClick={startDemo}>Explore demo data</Button>
        {authError && <p role="alert" className="mt-4 text-left text-xs text-loss">{authError}</p>}
        <p className="mt-6 text-[11px] text-mute">Requests scope: spreadsheets.readonly</p>
      </div>
    </div>
  );
}
