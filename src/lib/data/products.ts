import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Product } from "@/lib/database.types";
import { barcodeCandidates } from "@/lib/domain/barcode";

type SB = SupabaseClient<Database>;

export async function findProductByBarcode(
  sb: SB,
  code: string,
  opts: { includeArchived?: boolean } = {},
): Promise<Product | null> {
  let q = sb.from("products").select("*").in("barcode", barcodeCandidates(code));
  if (!opts.includeArchived) q = q.eq("is_archived", false);
  const { data, error } = await q.limit(1);
  if (error) throw error;
  return data[0] ?? null;
}

// PostgREST `or` filters use , ( ) as syntax; strip them (and wildcards) from user input.
function sanitize(q: string): string {
  return q.replace(/[,()%*\\]/g, " ").trim();
}

export async function searchProducts(sb: SB, q: string, limit = 8): Promise<Product[]> {
  const term = sanitize(q);
  if (!term) return [];
  const { data, error } = await sb
    .from("products")
    .select("*")
    .eq("is_archived", false)
    .or(`name.ilike.%${term}%,barcode.ilike.${term}%`)
    .order("name")
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function listProducts(sb: SB): Promise<Product[]> {
  const { data, error } = await sb.from("products").select("*").eq("is_archived", false).order("name");
  if (error) throw error;
  return data;
}

export type InventorySummary = { costValue: number; retailValue: number; wholesaleValue: number };

export async function getInventorySummary(sb: SB): Promise<InventorySummary> {
  const { data, error } = await sb.from("inventory_summary").select("*").single();
  if (error) throw error;
  return {
    costValue: Number(data.cost_value ?? 0),
    retailValue: Number(data.retail_value ?? 0),
    wholesaleValue: Number(data.wholesale_value ?? 0),
  };
}

export function isLowStock(p: Pick<Product, "stock" | "low_stock_threshold">): boolean {
  return p.stock <= p.low_stock_threshold;
}
