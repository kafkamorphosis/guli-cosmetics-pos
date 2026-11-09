import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CustomerDetail } from "@/features/customers/customer-detail";
import { requireRole } from "@/lib/auth/session";
import { uz } from "@/lib/i18n/uz";

export const metadata: Metadata = { title: uz.customers.title };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function MijozPage({ params }: PageProps<"/mijozlar/[id]">) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const me = await requireRole(["manager"]);
  return (
    <Suspense>
      <CustomerDetail id={id} isManager meId={me.id} />
    </Suspense>
  );
}
