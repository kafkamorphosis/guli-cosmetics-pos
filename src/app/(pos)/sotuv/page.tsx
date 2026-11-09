import type { Metadata } from "next";
import { SellLoader } from "@/features/seller/sell-loader";
import { requireRole } from "@/lib/auth/session";
import { uz } from "@/lib/i18n/uz";

export const metadata: Metadata = { title: uz.seller.sellTitle };

export default async function SotuvPage() {
  await requireRole(["seller"]);
  return <SellLoader />;
}
