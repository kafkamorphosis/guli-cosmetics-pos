import type { Metadata } from "next";
import { Suspense } from "react";
import { OrdersScreen } from "@/features/orders/orders-screen";
import { requireRole } from "@/lib/auth/session";
import { uz } from "@/lib/i18n/uz";

export const metadata: Metadata = { title: uz.orders.title };

export default async function BuyurtmalarPage() {
  await requireRole(["manager"]);
  return (
    <Suspense>
      <OrdersScreen />
    </Suspense>
  );
}
