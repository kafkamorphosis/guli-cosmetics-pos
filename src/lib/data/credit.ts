import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Order } from "@/lib/database.types";

type SB = SupabaseClient<Database>;

export type CreditRow = Pick<
  Order,
  "id" | "order_no" | "created_at" | "status" | "type" | "subtotal" | "shipping_krw" | "shipping_usd" | "paid_krw" | "credit_due_krw"
> & {
  customer: { name: string | null; phone: string } | null;
  seller: { full_name: string } | null;
};

export type CreditPayment = { id: string; amount_krw: number; paid_at: string; recorder: { full_name: string } | null };

// Nasiya orders that count as debts: approved, not cancelled. "due" = still owing, "paid" = settled.
export async function listCredit(sb: SB, which: "due" | "paid"): Promise<CreditRow[]> {
  let q = sb
    .from("orders")
    .select(
      "id, order_no, created_at, status, type, subtotal, shipping_krw, shipping_usd, paid_krw, credit_due_krw, customer:customers(name, phone), seller:profiles!orders_seller_id_fkey(full_name)",
    )
    .eq("payment_method", "credit")
    .not("status", "in", "(pending,cancelled)")
    .order("created_at", { ascending: which === "due" })
    .limit(500);
  q = which === "due" ? q.gt("credit_due_krw", 0) : q.eq("credit_due_krw", 0);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as CreditRow[];
}

export async function listCreditPayments(sb: SB, orderId: string): Promise<CreditPayment[]> {
  const { data, error } = await sb
    .from("credit_payments")
    .select("id, amount_krw, paid_at, recorder:profiles!credit_payments_recorded_by_fkey(full_name)")
    .eq("order_id", orderId)
    .order("paid_at");
  if (error) throw error;
  return (data ?? []) as unknown as CreditPayment[];
}

export async function recordCreditPayment(sb: SB, orderId: string, amount: number): Promise<Order> {
  const { data, error } = await sb.rpc("record_credit_payment", { p_order_id: orderId, p_amount: amount });
  if (error) throw error;
  return data;
}
