import type { Metadata } from "next";
import { MyOrdersScreen } from "@/features/seller/my-orders-screen";
import { requireRole } from "@/lib/auth/session";
import { uz } from "@/lib/i18n/uz";

export const metadata: Metadata = { title: uz.seller.myOrdersTitle };

export default async function BuyurtmalarimPage() {
  await requireRole(["seller"]);
  return <MyOrdersScreen />;
}
