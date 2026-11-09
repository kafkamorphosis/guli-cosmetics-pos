import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MyOrderDetail } from "@/features/seller/my-order-detail";
import { requireRole } from "@/lib/auth/session";
import { getMyOrder } from "@/lib/data/seller";
import { supabaseServer } from "@/lib/supabase/server";
import { uz } from "@/lib/i18n/uz";

export const metadata: Metadata = { title: uz.seller.myOrdersTitle };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function MyOrderPage({ params }: PageProps<"/buyurtmalarim/[id]">) {
  await requireRole(["seller"]);
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  // my_order returns null for another seller's order.
  const order = await getMyOrder(await supabaseServer(), { id }).catch(() => null);
  if (!order) notFound();
  return <MyOrderDetail order={order} />;
}
