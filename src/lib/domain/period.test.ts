import { describe, expect, it } from "vitest";
import { periodLabel, periodRange, seoulToday, shiftPeriod } from "./period";

describe("seoulToday", () => {
  it("uses the Seoul calendar day", () => {
    expect(seoulToday(new Date("2026-10-25T14:30:00Z"))).toBe("2026-10-25"); // 23:30 KST
    expect(seoulToday(new Date("2026-10-25T15:30:00Z"))).toBe("2026-10-26"); // 00:30 KST
  });
});

describe("periodRange", () => {
  it("day", () => {
    expect(periodRange("day", "2026-10-25")).toEqual({
      from: "2026-10-25T00:00:00+09:00",
      to: "2026-10-26T00:00:00+09:00",
      startYmd: "2026-10-25",
      endYmd: "2026-10-25",
    });
  });
  it("weeks run Monday to Sunday", () => {
    const sunday = periodRange("week", "2026-10-25");
    expect(sunday.startYmd).toBe("2026-10-19");
    expect(sunday.endYmd).toBe("2026-10-25");
    expect(sunday.to).toBe("2026-10-26T00:00:00+09:00");
    expect(periodRange("week", "2026-10-26").startYmd).toBe("2026-10-26");
  });
  it("month and year cross their boundaries", () => {
    const dec = periodRange("month", "2026-12-15");
    expect(dec.from).toBe("2026-12-01T00:00:00+09:00");
    expect(dec.to).toBe("2027-01-01T00:00:00+09:00");
    expect(dec.endYmd).toBe("2026-12-31");
    const year = periodRange("year", "2026-03-03");
    expect(year.startYmd).toBe("2026-01-01");
    expect(year.to).toBe("2027-01-01T00:00:00+09:00");
  });
});

describe("shiftPeriod", () => {
  it("moves to the adjacent period's first day", () => {
    expect(shiftPeriod("month", "2026-03-31", -1)).toBe("2026-02-01");
    expect(shiftPeriod("week", "2026-10-22", 1)).toBe("2026-10-26");
    expect(shiftPeriod("day", "2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftPeriod("year", "2026-06-15", -1)).toBe("2025-01-01");
  });
});

describe("periodLabel", () => {
  it("labels in Uzbek", () => {
    expect(periodLabel("day", "2026-10-23")).toBe("23.10.2026");
    expect(periodLabel("week", "2026-10-22")).toBe("19.10 – 25.10.2026");
    expect(periodLabel("month", "2026-10-23")).toBe("Oktabr 2026");
    expect(periodLabel("year", "2026-10-23")).toBe("2026");
  });
});
