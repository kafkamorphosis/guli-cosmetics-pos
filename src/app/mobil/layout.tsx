import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth/session";
import { MobileHeader } from "@/features/mobile/mobile-header";
import { uz } from "@/lib/i18n/uz";

export const metadata: Metadata = { title: { absolute: uz.brand } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1 };

// The Android app's screens: selling and product photos only, no POS menu.
export default async function MobileLayout({ children }: { children: React.ReactNode }) {
  const profile = await getSessionProfile();
  if (!profile) redirect("/login");

  return (
    <div className="flex min-h-dvh flex-col bg-cell">
      <MobileHeader name={profile.fullName || profile.username} />
      {profile.role === "manager" ? (
        children
      ) : (
        <p className="px-6 py-20 text-center text-lg leading-relaxed text-ink-2">{uz.mobile.wrongRole}</p>
      )}
    </div>
  );
}
