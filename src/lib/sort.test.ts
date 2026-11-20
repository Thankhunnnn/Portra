import { describe, it, expect } from "vitest";
import { nextSort, sortRows } from "./sort";

type K = "t" | "v";
const def = { key: "v" as K, dir: "desc" as const };

describe("nextSort", () => {
  it("cycles natural → reversed → default", () => {
    let s = nextSort(def, "t", def, ["t"]);
    expect(s).toEqual({ key: "t", dir: "asc" });
    s = nextSort(s, "t", def, ["t"]);
    expect(s).toEqual({ key: "t", dir: "desc" });
    s = nextSort(s, "t", def, ["t"]);
    expect(s).toEqual(def);
  });
  it("numeric columns start descending", () => {
    expect(nextSort({ key: "t", dir: "asc" }, "v", def, ["t"])).toEqual({ key: "v", dir: "desc" });
  });
});

describe("sortRows", () => {
  const rows = [{ t: "B", v: 2 }, { t: "A", v: NaN }, { t: "C", v: 9 }, { t: "D", v: 2 }];
  const get = (r: (typeof rows)[number], k: K) => r[k];
  it("sorts numbers desc, NaN last, stable on ties", () => {
    expect(sortRows(rows, { key: "v", dir: "desc" }, get).map((r) => r.t)).toEqual(["C", "B", "D", "A"]);
  });
  it("NaN stays last when ascending", () => {
    expect(sortRows(rows, { key: "v", dir: "asc" }, get).map((r) => r.t)).toEqual(["B", "D", "C", "A"]);
  });
  it("sorts text", () => {
    expect(sortRows(rows, { key: "t", dir: "asc" }, get).map((r) => r.t)).toEqual(["A", "B", "C", "D"]);
  });
});
