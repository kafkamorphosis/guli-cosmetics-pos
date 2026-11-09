import { describe, expect, it } from "vitest";
import { mergeFresh } from "./paging";

const o = (id: string, at: string, status = "pending") => ({ id, created_at: at, status });

describe("mergeFresh", () => {
  it("replaces refreshed rows, keeps older pages and stays newest first", () => {
    const loaded = [o("c", "2026-10-03"), o("b", "2026-10-02"), o("a", "2026-10-01")];
    const fresh = [o("d", "2026-10-04"), o("c", "2026-10-03", "new")];
    expect(mergeFresh(loaded, fresh)).toEqual([o("d", "2026-10-04"), o("c", "2026-10-03", "new"), o("b", "2026-10-02"), o("a", "2026-10-01")]);
  });
  it("takes the fresh page as is when nothing was loaded", () => {
    expect(mergeFresh(null, [o("a", "2026-10-01")])).toEqual([o("a", "2026-10-01")]);
  });
});
