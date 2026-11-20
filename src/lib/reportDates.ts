import { fmtDate, toMs } from "./portfolioEngine";

export function addMonths(date: string, months: number) {
  const time = new Date(toMs(date));
  const day = time.getUTCDate();
  time.setUTCDate(1);
  time.setUTCMonth(time.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(time.getUTCFullYear(), time.getUTCMonth() + 1, 0)).getUTCDate();
  time.setUTCDate(Math.min(day, lastDay));
  return fmtDate(time.getTime());
}

export function todayInBangkok() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Bangkok" }).format(new Date());
}
