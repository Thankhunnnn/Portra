import type { Transaction } from "./portfolioEngine";

export interface CustomAsset {
  ticker: string;
  name: string;
  currency: "USD" | "THB";
  prices: Record<string, number>;
  transactions: Transaction[];
}
