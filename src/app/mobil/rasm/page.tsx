import type { Metadata } from "next";
import { MobilePhotoLoader } from "@/features/mobile/loaders";
import { uz } from "@/lib/i18n/uz";

export const metadata: Metadata = { title: uz.mobile.photo };

export default function MobilePhotoPage() {
  return <MobilePhotoLoader />;
}
