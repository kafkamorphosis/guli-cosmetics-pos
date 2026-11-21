import type { Metadata } from "next";
import { MobileSellLoader } from "@/features/mobile/loaders";
import { uz } from "@/lib/i18n/uz";

export const metadata: Metadata = { title: uz.mobile.sell };

export default function MobileSellPage() {
  return <MobileSellLoader />;
}
