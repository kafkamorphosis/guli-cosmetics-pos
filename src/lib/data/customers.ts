import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { CustomerRow } from "@/lib/domain/customers";

type SB = SupabaseClient<Database>;

export type CustomerSummary = { id: string; name: string | null; orderCount: number };

export async function lookupCustomer(sb: SB, e164: string): Promise<CustomerSummary | null> {
  const { data, error } = await sb.from("customers").select("id, name").eq("phone", e164).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { count, error: countError } = await sb
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", data.id)
    .neq("status", "cancelled");
  if (countError) throw countError;
  return { id: data.id, name: data.name, orderCount: count ?? 0 };
}

const toRow = (r: CustomerRow): CustomerRow => ({
  ...r,
  orders: Number(r.orders),
  items: Number(r.items),
  spent: Number(r.spent),
  shipping_usd: Number(r.shipping_usd),
  tekpe_orders: Number(r.tekpe_orders),
});

// The database decides the scope: a seller always gets their own clients whatever sellerId says.
export async function listCustomerStats(sb: SB, sellerId: string | null): Promise<CustomerRow[]> {
  const { data, error } = await sb.rpc("customer_stats", { p_seller: sellerId });
  if (error) throw error;
  return (data ?? []).map(toRow);
}

export async function getCustomerStats(sb: SB, id: string, sellerId: string | null): Promise<CustomerRow | null> {
  const { data, error } = await sb.rpc("customer_stats", { p_seller: sellerId, p_customer: id });
  if (error) throw error;
  return data?.[0] ? toRow(data[0]) : null;
}

export async function renameCustomer(sb: SB, id: string, name: string): Promise<void> {
  const { error } = await sb.rpc("rename_customer", { p_customer: id, p_name: name });
  if (error) throw error;
}
