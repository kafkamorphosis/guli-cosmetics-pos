import { describe, expect, it } from "vitest";
import { creditTotal, outstanding } from "./credit";

describe("creditTotal", () => {
  it("owes goods and Korean shipping, not Uzbekistan dollars", () => {
    expect(creditTotal({ subtotal: 20000, shipping_krw: 4000 })).toBe(24000);
    expect(creditTotal({ subtotal: 20000, shipping_krw: 0 })).toBe(20000);
  });
});

describe("outstanding", () => {
  it("adds up what is left and what was paid", () => {
    const rows = [
      { subtotal: 20000, shipping_krw: 4000, paid_krw: 10000, credit_due_krw: 14000 },
      { subtotal: 5000, shipping_krw: 0, paid_krw: 0, credit_due_krw: 5000 },
    ];
    expect(outstanding(rows)).toEqual({ due: 19000, paid: 10000, count: 2 });
  });
});
