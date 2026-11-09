import { describe, expect, it } from "vitest";
import { stepStock, stockToSave } from "./stock";

describe("stockToSave", () => {
  it("is null when nothing changed or the field is blank", () => {
    expect(stockToSave(12, "12")).toBeNull();
    expect(stockToSave(12, "")).toBeNull();
    expect(stockToSave(12, "  ")).toBeNull();
  });
  it("returns the new whole quantity, never below zero", () => {
    expect(stockToSave(12, "20")).toBe(20);
    expect(stockToSave(12, "0")).toBe(0);
    expect(stockToSave(12, "-5")).toBe(0);
    expect(stockToSave(-3, "0")).toBe(0);
  });
});

describe("stepStock", () => {
  it("moves by ten and stops at zero", () => {
    expect(stepStock("12", 10)).toBe("22");
    expect(stepStock("4", -10)).toBe("0");
    expect(stepStock("", 10)).toBe("10");
  });
});
