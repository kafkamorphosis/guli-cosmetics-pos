import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Order, OrderItem } from "@/lib/database.types";
import { seoulDayEndExclusive, seoulDayStart } from "@/lib/domain/dates";
import { parseOrderSearch } from "@/lib/domain/order-search";
import type { OrderStatus, OrderType } from "@/lib/domain/types";

type SB = SupabaseClient<Database>;
type Person = { full_name: string } | null;

export type OrderWithItems = Order & {
  items: OrderItem[];
  customer: { name: string | null; phone: string } | null;
  seller: Person;
  approvedBy: Person;
  readyBy: Person;
  pickedUpBy: Person;
  cancelledBy: Person;
  box: { box_no: number; status: "open" | "closed" | "picked_up" } | null;
};

const ORDER_WITH_ITEMS = [
  "*",
  "items:order_items(*)",
  "customer:customers(name, phone)",
  "seller:profiles!orders_seller_id_fkey(full_name)",
  "approvedBy:profiles!orders_approved_by_fkey(full_name)",
  "readyBy:profiles!orders_ready_by_fkey(full_name)",
  "pickedUpBy:profiles!orders_picked_up_by_fkey(full_name)",
  "cancelledBy:profiles!orders_cancelled_by_fkey(full_name)",
  "box:boxes(box_no, status)",
].join(", ");

export async function getOrderWithItems(sb: SB, id: string): Promise<OrderWithItems | null> {
  const { data, error } = await sb.from("orders").select(ORDER_WITH_ITEMS).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const order = data as unknown as OrderWithItems;
  order.items.sort((a, b) => a.name.localeCompare(b.name, "uz"));
  return order;
}

export type OrderListRow = Order & {
  customer: { name: string | null; phone: string } | null;
  seller: Person;
};

export type OrderFilters = {
  status?: OrderStatus;
  type?: OrderType;
  sellerId?: string;
  customerId?: string;
  /** Leave out seller orders packed in a box. */
  noBox?: boolean;
  from?: string; // YYYY-MM-DD, Seoul
  to?: string; // YYYY-MM-DD, Seoul, inclusive
  q?: string;
  page?: number;
};

export async function listOrders(sb: SB, f: OrderFilters, pageSize = 50): Promise<{ rows: OrderListRow[]; total: number }> {
  const search = parseOrderSearch(f.q ?? "");
  // Filtering on the customer needs an inner join so non-matching orders drop out.
  const customerJoin = search && search.kind !== "orderNo" ? "customer:customers!inner(name, phone)" : "customer:customers(name, phone)";
  let q = sb
    .from("orders")
    .select(`*, ${customerJoin}, seller:profiles!orders_seller_id_fkey(full_name)`, { count: "exact" })
    .order("created_at", { ascending: false });

  if (f.status) q = q.eq("status", f.status);
  if (f.type) q = q.eq("type", f.type);
  if (f.sellerId) q = q.eq("seller_id", f.sellerId);
  if (f.customerId) q = q.eq("customer_id", f.customerId);
  if (f.noBox) q = q.is("box_id", null);
  if (f.from) q = q.gte("created_at", seoulDayStart(f.from));
  if (f.to) q = q.lt("created_at", seoulDayEndExclusive(f.to));
  if (search?.kind === "orderNo") q = q.eq("order_no", search.value);
  if (search?.kind === "phone") q = q.eq("customer.phone", search.value);
  if (search?.kind === "name") q = q.ilike("customer.name", `%${search.value.replace(/[%_]/g, "")}%`);

  const page = Math.max(1, f.page ?? 1);
  const { data, error, count } = await q.range((page - 1) * pageSize, page * pageSize - 1);
  if (error) throw error;
  return { rows: (data ?? []) as unknown as OrderListRow[], total: count ?? 0 };
}

export async function listSellers(sb: SB): Promise<{ id: string; full_name: string; username: string }[]> {
  const { data, error } = await sb.from("profiles").select("id, full_name, username").in("role", ["manager", "seller"]).order("full_name");
  if (error) throw error;
  return data;
}
