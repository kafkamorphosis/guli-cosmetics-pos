import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Product } from "@/lib/database.types";

type SB = SupabaseClient<Database>;

// Most urgent first: furthest below the threshold, then by name.
export async function listLowStock(sb: SB): Promise<Product[]> {
  const { data, error } = await sb.from("low_stock_products").select("*");
  if (error) throw error;
  return data.sort((a, b) => a.stock - a.low_stock_threshold - (b.stock - b.low_stock_threshold) || a.name.localeCompare(b.name, "uz"));
}

export async function countLowStock(sb: SB): Promise<number> {
  const { count, error } = await sb.from("low_stock_products").select("id", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

export async function countPending(sb: SB): Promise<number> {
  const { count, error } = await sb.from("orders").select("id", { count: "exact", head: true }).eq("status", "pending");
  if (error) throw error;
  return count ?? 0;
}

export type PendingOrder = {
  id: string;
  order_no: number;
  created_at: string;
  destination: "KR" | "UZ" | null;
  item_count: number;
  subtotal: number;
  shipping_krw: number;
  shipping_usd: number;
  customer: { name: string | null; phone: string } | null;
  seller: { full_name: string } | null;
};

export async function listPending(sb: SB): Promise<PendingOrder[]> {
  const { data, error } = await sb
    .from("orders")
    .select("id, order_no, created_at, destination, item_count, subtotal, shipping_krw, shipping_usd, customer:customers(name, phone), seller:profiles!orders_seller_id_fkey(full_name)")
    .eq("status", "pending")
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as unknown as PendingOrder[];
}
