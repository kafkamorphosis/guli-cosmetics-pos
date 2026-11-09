import type { Metadata } from "next";
import { Suspense } from "react";
import { TekpeScreen } from "@/features/tekpe/tekpe-screen";
import { requireRole } from "@/lib/auth/session";
import { uz } from "@/lib/i18n/uz";

export const metadata: Metadata = { title: uz.tekpe.title };

export default async function TekpePage() {
  await requireRole(["manager"]);
  return (
    <Suspense>
      <TekpeScreen />
    </Suspense>
  );
}
