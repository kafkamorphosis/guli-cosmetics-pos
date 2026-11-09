import { describe, expect, it } from "vitest";
import { customersCsv, filterCustomers, sortCustomers, type CustomerRow } from "./customers";

const row = (over: Partial<CustomerRow>): CustomerRow => ({
  id: "x",
  phone: "+821011110000",
  name: "Ali",
  created_at: "2026-10-01T03:00:00Z",
  orders: 1,
  items: 1,
  spent: 10000,
  shipping_usd: 0,
  tekpe_orders: 0,
  last_order_at: "2026-10-20T03:00:00Z",
  ...over,
});

const ali = row({ id: "a" });
const vali = row({ id: "v", phone: "+998901112233", name: "Vali", orders: 5, spent: 5000, last_order_at: "2026-10-22T03:00:00Z" });
const noName = row({ id: "n", phone: "+821099998888", name: null, orders: 2, spent: 90000, last_order_at: "2026-10-10T03:00:00Z" });

describe("filterCustomers", () => {
  it("matches names without case", () => {
    expect(filterCustomers([ali, vali, noName], "vAL").map((c) => c.id)).toEqual(["v"]);
  });
  it("matches phones typed in local or international form", () => {
    expect(filterCustomers([ali, vali, noName], "010-1111").map((c) => c.id)).toEqual(["a"]);
    expect(filterCustomers([ali, vali, noName], "+82 10 9999").map((c) => c.id)).toEqual(["n"]);
    expect(filterCustomers([ali, vali, noName], "90 111 22").map((c) => c.id)).toEqual(["v"]);
  });
  it("keeps everyone for an empty query", () => {
    expect(filterCustomers([ali, vali], "  ")).toHaveLength(2);
  });
});

describe("sortCustomers", () => {
  it("sorts by last purchase, spending, orders or name", () => {
    const all = [ali, vali, noName];
    expect(sortCustomers(all, "recent").map((c) => c.id)).toEqual(["v", "a", "n"]);
    expect(sortCustomers(all, "spent").map((c) => c.id)).toEqual(["n", "a", "v"]);
    expect(sortCustomers(all, "orders").map((c) => c.id)).toEqual(["v", "n", "a"]);
    expect(sortCustomers(all, "name").map((c) => c.id)).toEqual(["a", "v", "n"]); // unnamed last
  });
  it("does not mutate the input", () => {
    const all = [ali, vali];
    sortCustomers(all, "name");
    expect(all.map((c) => c.id)).toEqual(["a", "v"]);
  });
});

describe("customersCsv", () => {
  it("writes a header and one escaped line per client, with a BOM for Excel", () => {
    const csv = customersCsv([row({ name: 'Ali "aka", Co', shipping_usd: 20, tekpe_orders: 1 })]);
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe("Ism,Telefon,Buyurtmalar,Tekpe,Mahsulotlar,Jami (₩),Yetkazish ($),Oxirgi xarid,Birinchi xarid");
    expect(lines[1]).toBe('"Ali ""aka"", Co",\'+82 10 1111 0000,1,1,1,10000,20,20.10.2026 12:00,01.10.2026 12:00');
  });
  it("neutralises spreadsheet formulas in names", () => {
    const line = customersCsv([row({ name: "=HYPERLINK(1)" })]).split("\r\n")[1];
    expect(line.startsWith("'=HYPERLINK(1)")).toBe(true);
  });
});
