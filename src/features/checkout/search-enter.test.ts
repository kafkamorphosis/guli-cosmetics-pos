import { describe, expect, it } from "vitest";
import { resolveEnter } from "./search-enter";

const p = (id: string, barcode: string) => ({ id, barcode });
const stale = [p("old1", "8801111111111"), p("old2", "8801111111112")];

describe("resolveEnter", () => {
  it("an all-digit query is always looked up as a barcode, never a stale suggestion", () => {
    expect(resolveEnter({ query: "8801111111119", resultsFor: "88011", results: stale, active: 0, navigated: false })).toEqual({
      kind: "barcode",
      code: "8801111111119",
    });
  });
  it("picks the highlighted suggestion only when it belongs to the current query", () => {
    expect(resolveEnter({ query: "krem", resultsFor: "krem", results: stale, active: 1, navigated: false })).toEqual({
      kind: "pick",
      product: stale[1],
    });
    expect(resolveEnter({ query: "kremlar", resultsFor: "krem", results: stale, active: 0, navigated: false })).toEqual({ kind: "none" });
  });
  it("respects a highlight the user chose with the arrow keys", () => {
    expect(resolveEnter({ query: "kremlar", resultsFor: "krem", results: stale, active: 1, navigated: true })).toEqual({
      kind: "pick",
      product: stale[1],
    });
  });
  it("does nothing for an empty query", () => {
    expect(resolveEnter({ query: "  ", resultsFor: "", results: [], active: 0, navigated: false })).toEqual({ kind: "none" });
  });
});
