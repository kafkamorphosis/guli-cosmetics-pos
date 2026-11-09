import type { Metadata } from "next";
import { Suspense } from "react";
import { CustomersScreen } from "@/features/customers/customers-screen";
import { requireRole } from "@/lib/auth/session";
import { uz } from "@/lib/i18n/uz";

export const metadata: Metadata = { title: uz.customers.title };

export default async function MijozlarPage() {
  const me = await requireRole(["manager"]);
  return (
    <Suspense>
      <CustomersScreen isManager meId={me.id} />
    </Suspense>
  );
}
