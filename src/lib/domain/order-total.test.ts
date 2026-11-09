import { describe, expect, it } from "vitest";
import { formatOrderTotal, orderTotal } from "./order-total";

describe("orderTotal", () => {
  it("adds KRW shipping to the subtotal", () => {
    expect(orderTotal({ subtotal: 85000, shipping_krw: 4000, shipping_usd: 0 })).toEqual({ krw: 89000, usd: 0 });
  });
  it("keeps USD shipping separate", () => {
    expect(orderTotal({ subtotal: 85000, shipping_krw: 0, shipping_usd: 20 })).toEqual({ krw: 85000, usd: 20 });
  });
});

describe("formatOrderTotal", () => {
  it("shows one part when there is no USD", () => {
    expect(formatOrderTotal({ subtotal: 85000, shipping_krw: 4000, shipping_usd: 0 })).toBe("89 000 ₩");
  });
  it("shows two parts for Uzbekistan", () => {
    expect(formatOrderTotal({ subtotal: 85000, shipping_krw: 0, shipping_usd: 20 })).toBe("85 000 ₩ + 20 $");
  });
});
