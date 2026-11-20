import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PortfolioProvider } from "@/context/portfolio";
import { AppShell } from "@/components/shell/AppShell";
import { RegisterSW } from "@/components/RegisterSW";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "Portra – Portfolio Tracker",
  description: "Personal portfolio tracker powered by your Google Sheet",
  manifest: `${base}/manifest.webmanifest`,
  appleWebApp: { capable: true, title: "Portra", statusBarStyle: "black-translucent" },
  icons: { icon: `${base}/icon.svg`, apple: `${base}/icon.svg` },
};
export const viewport: Viewport = { themeColor: "#0e1015", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <PortfolioProvider>
          <AppShell>{children}</AppShell>
        </PortfolioProvider>
        <RegisterSW />
      </body>
    </html>
  );
}
