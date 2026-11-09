import { describe, expect, it } from "vitest";
import { formatPhone, normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it("accepts Korean local formats", () => {
    expect(normalizePhone("010-1234-5678", "KR")).toBe("+821012345678");
    expect(normalizePhone("01012345678", "KR")).toBe("+821012345678");
    expect(normalizePhone("+82 10 1234 5678", "KR")).toBe("+821012345678");
  });
  it("accepts Uzbek numbers", () => {
    expect(normalizePhone("90 123 45 67", "UZ")).toBe("+998901234567");
  });
  it("an explicit country code wins over the selected chip", () => {
    expect(normalizePhone("+998901234567", "KR")).toBe("+998901234567");
  });
  it("rejects invalid input", () => {
    expect(normalizePhone("123", "KR")).toBeNull();
    expect(normalizePhone("", "KR")).toBeNull();
  });
});

describe("formatPhone", () => {
  it("formats internationally", () => {
    expect(formatPhone("+821012345678")).toBe("+82 10 1234 5678");
  });
});
