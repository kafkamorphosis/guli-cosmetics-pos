import { describe, expect, it } from "vitest";
import { formatKg, formatKrw, formatUsd, formatWeight } from "./money";
import { formatDateTime } from "./dates";
import { formatBoxNo, formatOrderNo } from "./order-no";

describe("money", () => {
  it("formats KRW with space thousands and symbol after", () => {
    expect(formatKrw(85000)).toBe("85 000 ₩");
    expect(formatKrw(0)).toBe("0 ₩");
    expect(formatKrw(1234567)).toBe("1 234 567 ₩");
  });
  it("formats USD with comma decimals", () => {
    expect(formatUsd(30)).toBe("30 $");
    expect(formatUsd(10.5)).toBe("10,5 $");
  });
});

describe("weight", () => {
  it("shows grams below 1 kg and kg above", () => {
    expect(formatWeight(250)).toBe("250 g");
    expect(formatWeight(1250)).toBe("1,25 kg");
    expect(formatWeight(2000)).toBe("2 kg");
  });
  it("always shows kg for totals", () => {
    expect(formatKg(1250)).toBe("1,25 kg");
    expect(formatKg(300)).toBe("0,3 kg");
  });
});

describe("dates", () => {
  it("formats in Asia/Seoul", () => {
    expect(formatDateTime("2026-10-23T15:30:00Z")).toBe("24.10.2026 00:30");
  });
});

describe("order number", () => {
  it("pads to 6 digits", () => {
    expect(formatOrderNo(123)).toBe("#000123");
    expect(formatOrderNo(1234567)).toBe("#1234567");
    expect(formatBoxNo(12)).toBe("#Q0012");
    expect(formatBoxNo(123456)).toBe("#Q123456");
  });
});
