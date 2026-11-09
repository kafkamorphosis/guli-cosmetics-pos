import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { PaymentMethod } from "@/lib/domain/types";

type SB = SupabaseClient<Database>;

export type ReportProduct = {
  product_id: string;
  name: string;
  photo_path: string | null;
  unit_weight_g: number;
  qty: number;
  revenue: number;
  /** null for sellers: they never see cost. */
  cost: number | null;
};

export type Report = {
  orders: number;
  items: number;
  revenue: number;
  /** null for sellers. */
  cost: number | null;
  profit: number | null;
  shipping_krw: number;
  shipping_usd: number;
  by_payment: { method: PaymentMethod; orders: number; revenue: number }[];
  products: ReportProduct[];
};

export type LeastSoldRow = { product_id: string; name: string; photo_path: string | null; stock: number; qty_sold: number };

// The database decides the scope: a seller always gets their own numbers whatever sellerId says.
export async function getReport(sb: SB, from: string, to: string, sellerId: string | null): Promise<Report> {
  const { data, error } = await sb.rpc("analytics_report", { p_from: from, p_to: to, p_seller: sellerId });
  if (error) throw error;
  return normalizeReport(data);
}

const num = (v: unknown) => (v == null ? null : Number(v));

// Postgres sums arrive as strings or numbers; sellers' reports carry no cost at all.
export function normalizeReport(data: unknown): Report {
  const r = data as Report;
  return {
    ...r,
    cost: num(r.cost),
    profit: num(r.profit),
    shipping_usd: Number(r.shipping_usd),
    products: r.products.map((p) => ({ ...p, qty: Number(p.qty), revenue: Number(p.revenue), cost: num(p.cost) })),
  };
}

export async function getLeastSold(sb: SB, days: number, sellerId: string | null): Promise<LeastSoldRow[]> {
  const { data, error } = await sb.rpc("least_sold", { p_days: days, p_seller: sellerId, p_limit: 10 });
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...r, qty_sold: Number(r.qty_sold) }));
}
