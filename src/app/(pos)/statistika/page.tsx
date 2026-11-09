import type { Metadata } from "next";
import { Suspense } from "react";
import { AnalyticsScreen } from "@/features/analytics/analytics-screen";
import { requireRole } from "@/lib/auth/session";
import { uz } from "@/lib/i18n/uz";

export const metadata: Metadata = { title: uz.analytics.title };

export default async function StatistikaPage() {
  const me = await requireRole(["manager", "seller"]);
  return (
    <Suspense>
      <AnalyticsScreen isManager={me.role === "manager"} meId={me.id} />
    </Suspense>
  );
}
