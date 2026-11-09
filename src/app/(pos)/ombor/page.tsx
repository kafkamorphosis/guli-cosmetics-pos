import type { Metadata } from "next";
import { Suspense } from "react";
import { InventoryScreen } from "@/features/inventory/inventory-screen";
import { requireRole } from "@/lib/auth/session";
import { uz } from "@/lib/i18n/uz";

export const metadata: Metadata = { title: uz.inventory.title };

export default async function OmborPage() {
  await requireRole(["manager"]);
  return (
    <Suspense>
      <InventoryScreen />
    </Suspense>
  );
}
