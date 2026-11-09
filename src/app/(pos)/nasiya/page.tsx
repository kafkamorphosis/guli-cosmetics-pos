import type { Metadata } from "next";
import { CreditScreen } from "@/features/orders/credit-screen";
import { requireRole } from "@/lib/auth/session";
import { uz } from "@/lib/i18n/uz";

export const metadata: Metadata = { title: uz.nasiya.title };

export default async function NasiyaPage() {
  await requireRole(["manager"]);
  return <CreditScreen />;
}
