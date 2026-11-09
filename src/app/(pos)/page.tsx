import type { Metadata } from "next";
import { CheckoutLoader } from "@/features/checkout/checkout-loader";
import { requireRole } from "@/lib/auth/session";
import { uz } from "@/lib/i18n/uz";

export const metadata: Metadata = { title: uz.checkout.title };

export default async function KassaPage() {
  await requireRole(["manager"]);
  return <CheckoutLoader />;
}
