import { describe, expect, it } from "vitest";
import { seoulDayEndExclusive, seoulDayStart } from "./dates";
import { parseOrderSearch } from "./order-search";

describe("Seoul day bounds", () => {
  it("starts a day at Seoul midnight", () => {
    expect(seoulDayStart("2026-10-23")).toBe("2026-10-23T00:00:00+09:00");
  });
  it("ends a day at the next Seoul midnight, across month ends", () => {
    expect(seoulDayEndExclusive("2026-10-23")).toBe("2026-10-24T00:00:00+09:00");
    expect(seoulDayEndExclusive("2026-10-31")).toBe("2026-11-01T00:00:00+09:00");
  });
});

describe("parseOrderSearch", () => {
  it("reads order numbers with or without # and zeros", () => {
    expect(parseOrderSearch("#000123")).toEqual({ kind: "orderNo", value: 123 });
    expect(parseOrderSearch("123")).toEqual({ kind: "orderNo", value: 123 });
  });
  it("reads phone numbers", () => {
    expect(parseOrderSearch("010-1234-5678")).toEqual({ kind: "phone", value: "+821012345678" });
    expect(parseOrderSearch("+998901234567")).toEqual({ kind: "phone", value: "+998901234567" });
  });
  it("falls back to customer name", () => {
    expect(parseOrderSearch(" Dilnoza ")).toEqual({ kind: "name", value: "Dilnoza" });
  });
  it("ignores empty input", () => {
    expect(parseOrderSearch("  ")).toBeNull();
  });
});
