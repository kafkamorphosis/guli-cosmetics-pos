import { describe, expect, it } from "vitest";
import { computeShipping } from "./shipping";

const rates = { krShippingKrw: 4000, uzShippingUsdPerKg: 10 };

describe("computeShipping", () => {
  it("charges nothing for store orders", () => {
    expect(computeShipping({ type: "store", destination: null, totalWeightG: 5000, rates })).toEqual({ shippingKrw: 0, shippingUsd: 0, shippingKg: 0 });
  });
  it("charges a flat KRW fee per Korea order", () => {
    expect(computeShipping({ type: "tekpe", destination: "KR", totalWeightG: 5000, rates })).toEqual({ shippingKrw: 4000, shippingUsd: 0, shippingKg: 0 });
  });
  it("charges at least 1 kg for Uzbekistan, even at 0 g", () => {
    expect(computeShipping({ type: "tekpe", destination: "UZ", totalWeightG: 0, rates })).toEqual({ shippingKrw: 0, shippingUsd: 10, shippingKg: 1 });
  });
  it("rounds Uzbekistan weight up to the next kg", () => {
    expect(computeShipping({ type: "tekpe", destination: "UZ", totalWeightG: 1000, rates }).shippingKg).toBe(1);
    expect(computeShipping({ type: "tekpe", destination: "UZ", totalWeightG: 1001, rates })).toEqual({ shippingKrw: 0, shippingUsd: 20, shippingKg: 2 });
    expect(computeShipping({ type: "tekpe", destination: "UZ", totalWeightG: 2500, rates }).shippingUsd).toBe(30);
  });
});
