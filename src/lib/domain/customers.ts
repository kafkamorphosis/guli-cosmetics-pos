import { parsePhoneNumberFromString } from "libphonenumber-js";
import { formatDateTime } from "./dates";
import { formatPhone } from "./phone";

// One row of customer_stats: totals over the orders in scope (cancelled ones excluded).
export type CustomerRow = {
  id: string;
  phone: string;
  name: string | null;
  created_at: string;
  orders: number;
  items: number;
  /** Goods + Korean shipping, ₩. */
  spent: number;
  shipping_usd: number;
  tekpe_orders: number;
  last_order_at: string | null;
};

export type CustomerSort = "recent" | "spent" | "orders" | "name";

function phoneForms(e164: string): string[] {
  const national = parsePhoneNumberFromString(e164)?.nationalNumber ?? "";
  // "0" + national number is how Koreans type their own numbers (010-…).
  return [e164.replace(/\D/g, ""), national, `0${national}`];
}

export function filterCustomers(rows: CustomerRow[], query: string): CustomerRow[] {
  const q = query.trim().toLocaleLowerCase("uz");
  if (!q) return rows;
  const digits = q.replace(/\D/g, "");
  return rows.filter(
    (c) =>
      (c.name ?? "").toLocaleLowerCase("uz").includes(q) ||
      (digits.length >= 3 && phoneForms(c.phone).some((f) => f.includes(digits))),
  );
}

const byTime = (a: string | null, b: string | null) => (b ?? "").localeCompare(a ?? "");

export function sortCustomers(rows: CustomerRow[], sort: CustomerSort): CustomerRow[] {
  const out = [...rows];
  if (sort === "recent") out.sort((a, b) => byTime(a.last_order_at, b.last_order_at));
  if (sort === "spent") out.sort((a, b) => b.spent - a.spent || byTime(a.last_order_at, b.last_order_at));
  if (sort === "orders") out.sort((a, b) => b.orders - a.orders || b.spent - a.spent);
  if (sort === "name")
    out.sort((a, b) => {
      if (!a.name || !b.name) return a.name ? -1 : b.name ? 1 : 0;
      return a.name.localeCompare(b.name, "uz");
    });
  return out;
}

const HEADER = ["Ism", "Telefon", "Buyurtmalar", "Tekpe", "Mahsulotlar", "Jami (₩)", "Yetkazish ($)", "Oxirgi xarid", "Birinchi xarid"];

function cell(value: string | number): string {
  let s = String(value);
  // Spreadsheets run cells that start with these as formulas.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function customersCsv(rows: CustomerRow[]): string {
  const lines = rows.map((c) =>
    [
      c.name ?? "",
      formatPhone(c.phone),
      c.orders,
      c.tekpe_orders,
      c.items,
      c.spent,
      c.shipping_usd,
      c.last_order_at ? formatDateTime(c.last_order_at) : "",
      formatDateTime(c.created_at),
    ]
      .map(cell)
      .join(","),
  );
  return "﻿" + [HEADER.join(","), ...lines].join("\r\n");
}
