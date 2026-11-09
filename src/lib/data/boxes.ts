import type { SupabaseClient } from "@supabase/supabase-js";
import type { Box, Database } from "@/lib/database.types";

type SB = SupabaseClient<Database>;

export type BoxStatus = Box["status"];

export type BoxRow = Box & {
  seller: { full_name: string; username: string } | null;
  orders: { item_count: number; total_weight_g: number; status: string }[];
};

// Open boxes have no totals yet: they are summed from their live orders until the box is closed.
export function liveTotals(b: BoxRow) {
  if (b.status !== "open") return { orders: b.order_count, items: b.item_count, weightG: b.total_weight_g };
  const live = b.orders.filter((o) => o.status === "new");
  return {
    orders: live.length,
    items: live.reduce((n, o) => n + o.item_count, 0),
    weightG: live.reduce((n, o) => n + o.total_weight_g, 0),
  };
}

export async function listBoxes(sb: SB, status: BoxStatus): Promise<BoxRow[]> {
  const { data, error } = await sb
    .from("boxes")
    .select("*, seller:profiles!boxes_seller_id_fkey(full_name, username), orders(item_count, total_weight_g, status)")
    .eq("status", status)
    .order(status === "open" ? "created_at" : status === "closed" ? "closed_at" : "picked_up_at", { ascending: status === "open" })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map((b) => ({ ...(b as unknown as BoxRow), shipping_usd: Number(b.shipping_usd) }));
}

export async function countBoxes(sb: SB, status: BoxStatus): Promise<number> {
  const { count, error } = await sb.from("boxes").select("id", { count: "exact", head: true }).eq("status", status);
  if (error) throw error;
  return count ?? 0;
}

export type BoxSheetOrder = {
  id: string;
  order_no: number;
  status: string;
  item_count: number;
  total_weight_g: number;
  ship_city: string | null;
  ship_district: string | null;
  created_at: string;
  customer: { name: string | null; phone: string } | null;
  items: { id: string; name: string; qty: number; barcode: string }[];
};

export type BoxForSheet = Box & { seller: { full_name: string; username: string } | null; orders: BoxSheetOrder[] };

export async function getBoxForSheet(sb: SB, id: string): Promise<BoxForSheet | null> {
  const { data, error } = await sb
    .from("boxes")
    .select(
      "*, seller:profiles!boxes_seller_id_fkey(full_name, username), orders(id, order_no, status, item_count, total_weight_g, ship_city, ship_district, created_at, customer:customers(name, phone), items:order_items(id, name, qty, barcode))",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const box = data as unknown as BoxForSheet;
  box.shipping_usd = Number(box.shipping_usd);
  box.orders = box.orders.filter((o) => o.status !== "cancelled").sort((a, b) => a.order_no - b.order_no);
  for (const o of box.orders) o.items.sort((a, b) => a.name.localeCompare(b.name, "uz"));
  return box;
}
