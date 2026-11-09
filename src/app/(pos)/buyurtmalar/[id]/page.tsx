import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OrderDetail } from "@/features/orders/order-detail";
import { getOrderWithItems } from "@/lib/data/orders";
import { formatOrderNo } from "@/lib/domain/order-no";
import { supabaseServer } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { uz } from "@/lib/i18n/uz";

export async function generateMetadata({ params }: PageProps<"/buyurtmalar/[id]">): Promise<Metadata> {
  const { id } = await params;
  const order = await getOrderWithItems(await supabaseServer(), id).catch(() => null);
  return { title: order ? formatOrderNo(order.order_no) : uz.orders.title };
}

export default async function OrderPage({ params }: PageProps<"/buyurtmalar/[id]">) {
  await requireRole(["manager"]);
  const { id } = await params;
  const order = await getOrderWithItems(await supabaseServer(), id).catch(() => null);
  if (!order) notFound();
  return <OrderDetail order={order} />;
}
