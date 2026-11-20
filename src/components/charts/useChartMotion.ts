import { usePortfolio } from "@/context/portfolio";
import { useSyncExternalStore } from "react";

function subscribe(listener: () => void) {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}

export function useChartMotion() {
  const { settings: { motion } } = usePortfolio();
  const system = useSyncExternalStore(subscribe, () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches, () => false);
  return motion === "On" || (motion === "System" && system);
}
