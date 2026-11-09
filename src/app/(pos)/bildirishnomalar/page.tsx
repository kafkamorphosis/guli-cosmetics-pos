import type { Metadata } from "next";
import { NotificationsScreen } from "@/features/notifications/notifications-screen";
import { requireRole } from "@/lib/auth/session";
import { uz } from "@/lib/i18n/uz";

export const metadata: Metadata = { title: uz.notifications.title };

export default async function BildirishnomalarPage() {
  await requireRole(["manager"]);
  return <NotificationsScreen />;
}
