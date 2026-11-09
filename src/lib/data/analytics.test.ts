import { describe, expect, it } from "vitest";
import { normalizeReport } from "./analytics";

const base = { orders: 1, items: 2, revenue: 20000, shipping_krw: 0, shipping_usd: "10.00", by_payment: [] };

describe("normalizeReport", () => {
  it("keeps cost and profit for managers", () => {
    const r = normalizeReport({ ...base, cost: 12000, profit: 8000, products: [{ product_id: "p", name: "A", photo_path: null, unit_weight_g: 100, qty: "2", revenue: "20000", cost: "12000" }] });
    expect(r.cost).toBe(12000);
    expect(r.shipping_usd).toBe(10);
    expect(r.products[0]).toMatchObject({ qty: 2, revenue: 20000, cost: 12000 });
  });
  it("leaves cost and profit empty for sellers", () => {
    const r = normalizeReport({ ...base, cost: null, profit: null, products: [{ product_id: "p", name: "A", photo_path: null, unit_weight_g: 100, qty: 2, revenue: 20000 }] });
    expect(r.cost).toBeNull();
    expect(r.profit).toBeNull();
    expect(r.products[0].cost).toBeNull();
  });
});
