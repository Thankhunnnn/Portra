export type SortDir = "asc" | "desc";
export interface SortState<K extends string> { key: K; dir: SortDir }

/**
 * Tri-state header click: first click → natural direction (text asc, numbers desc),
 * second → reversed, third → back to the default sort.
 */
export function nextSort<K extends string>(cur: SortState<K>, key: K, def: SortState<K>, textKeys: K[] = []): SortState<K> {
  const natural: SortDir = textKeys.includes(key) ? "asc" : "desc";
  if (cur.key !== key) return { key, dir: natural };
  if (cur.dir === natural) return { key, dir: natural === "asc" ? "desc" : "asc" };
  return def;
}

/** Stable sort; NaN/undefined always sink to the bottom regardless of direction. */
export function sortRows<T, K extends string>(rows: T[], sort: SortState<K>, get: (r: T, k: K) => number | string): T[] {
  const m = sort.dir === "asc" ? 1 : -1;
  return rows
    .map((r, i) => ({ r, i, v: get(r, sort.key) }))
    .sort((a, b) => {
      const an = typeof a.v === "number" && isNaN(a.v);
      const bn = typeof b.v === "number" && isNaN(b.v);
      if (an || bn) return an === bn ? a.i - b.i : an ? 1 : -1;
      const c = typeof a.v === "string" || typeof b.v === "string" ? String(a.v).localeCompare(String(b.v)) : a.v - (b.v as number);
      return c !== 0 ? c * m : a.i - b.i;
    })
    .map((x) => x.r);
}
