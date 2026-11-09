import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";
import type { CartProduct } from "@/lib/domain/cart";
import type { Destination, OrderStatus, OrderType, PaymentMethod } from "@/lib/domain/types";

type SB = SupabaseClient<Database>;

// What a seller sees of an order: the same shape my_orders / my_order return, never any cost.
export type MyOrder = {
  id: string;
  order_no: number;
  request_id: string;
  created_at: string;
  status: OrderStatus;
  type: OrderType;
  destination: Destination | null;
  payment_method: PaymentMethod;
  item_count: number;
  line_count: number;
  total_weight_g: number;
  subtotal: number;
  shipping_krw: number;
  shipping_usd: number;
  shipping_kg: number;
  paid_krw: number;
  credit_due_krw: number;
  approved_at: string | null;
  ready_at: string | null;
  picked_up_at: string | null;
  cancelled_at: string | null;
  ship_city: string | null;
  ship_district: string | null;
  box_id: string | null;
  box_no: number | null;
  box_status: "open" | "closed" | "picked_up" | null;
  customer: { name: string | null; phone: string } | null;
};

export type MyOrderItem = {
  id: string;
  barcode: string;
  name: string;
  photo_path: string | null;
  unit_price: number;
  is_wholesale: boolean;
  qty: number;
  line_total: number;
  unit_weight_g: number;
  line_weight_g: number;
};

export type MyOrderWithItems = MyOrder & { items: MyOrderItem[] };

const toOrder = <T extends MyOrder>(o: T): T => ({ ...o, shipping_usd: Number(o.shipping_usd) });

export const CATALOG_PAGE = 60;

export async function sellerCatalog(sb: SB, query: string, offset = 0): Promise<CartProduct[]> {
  const { data, error } = await sb.rpc("seller_catalog", { p_query: query.trim() || null, p_limit: CATALOG_PAGE, p_offset: offset });
  if (error) throw error;
  return (data ?? []).map((p) => ({
    id: p.id,
    barcode: p.barcode,
    name: p.name,
    photoPath: p.photo_path,
    retailPrice: p.retail_price,
    wholesalePrice: p.wholesale_price,
    weightG: p.weight_g,
    stock: p.stock,
  }));
}

export async function submitSellerOrder(
  sb: SB,
  args: {
    requestId: string;
    items: { product_id: string; qty: number; is_wholesale: boolean }[];
    phone: string;
    name: string;
    city: string;
    district: string;
    payment: PaymentMethod;
    destination: Destination;
  },
  signal?: AbortSignal,
): Promise<{ id: string; order_no: number }> {
  let q = sb.rpc("submit_seller_order", {
    p_request_id: args.requestId,
    p_items: args.items as unknown as Json,
    p_customer_phone: args.phone,
    p_customer_name: args.name,
    p_city: args.city,
    p_district: args.district,
    p_payment_method: args.payment,
    p_destination: args.destination,
  });
  if (signal) q = q.abortSignal(signal);
  const { data, error } = await q;
  if (error) throw error;
  return { id: data.id, order_no: data.order_no };
}

export async function listMyOrders(sb: SB, limit: number, offset: number): Promise<MyOrder[]> {
  const { data, error } = await sb.rpc("my_orders", { p_limit: limit, p_offset: offset });
  if (error) throw error;
  return ((data ?? []) as unknown as MyOrder[]).map(toOrder);
}

export async function getMyOrder(sb: SB, by: { id?: string; requestId?: string }): Promise<MyOrderWithItems | null> {
  const { data, error } = await sb.rpc("my_order", { p_id: by.id ?? null, p_request_id: by.requestId ?? null });
  if (error) throw error;
  return data ? toOrder(data as unknown as MyOrderWithItems) : null;
}
