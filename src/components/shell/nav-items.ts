import { Bell, Boxes, ChartColumn, Contact, HandCoins, ReceiptText, ScanBarcode, Settings, ShoppingBag, Truck, Users, type LucideIcon } from "lucide-react";
import type { NavKey } from "@/lib/auth/home";
import { uz } from "@/lib/i18n/uz";

export type BadgeKind = "lowStock" | "pending";
export type BadgeCounts = Record<BadgeKind, number | null>;

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Live counts shown on the item, added up. */
  badge?: BadgeKind[];
  /** On phones this item lives in the "Boshqa" sheet instead of the bottom bar. */
  more?: boolean;
};

export type { NavKey };

export const NAV: Record<NavKey, NavItem[]> = {
  pos: [
    { href: "/", label: uz.nav.checkout, icon: ScanBarcode },
    { href: "/ombor", label: uz.nav.inventory, icon: Boxes },
    { href: "/buyurtmalar", label: uz.nav.orders, icon: ReceiptText },
    { href: "/nasiya", label: uz.nav.nasiya, icon: HandCoins },
    { href: "/tekpe", label: uz.nav.tekpe, icon: Truck, badge: ["pending"] },
    { href: "/mijozlar", label: uz.nav.customers, icon: Contact, more: true },
    { href: "/statistika", label: uz.nav.analytics, icon: ChartColumn, more: true },
    { href: "/bildirishnomalar", label: uz.nav.notifications, icon: Bell, badge: ["lowStock", "pending"], more: true },
  ],
  seller: [
    { href: "/sotuv", label: uz.nav.sell, icon: ShoppingBag },
    { href: "/buyurtmalarim", label: uz.nav.myOrders, icon: ReceiptText },
    { href: "/statistika", label: uz.nav.analytics, icon: ChartColumn },
  ],
  admin: [
    { href: "/admin", label: uz.nav.admin, icon: Users },
    { href: "/admin/sozlamalar", label: uz.nav.settings, icon: Settings },
  ],
};

// Counts still loading are left out; nothing loaded yet shows no badge.
export function badgeCount(item: Pick<NavItem, "badge">, counts: BadgeCounts): number | null {
  const loaded = (item.badge ?? []).map((k) => counts[k]).filter((n): n is number => n !== null);
  return loaded.length ? loaded.reduce((a, b) => a + b, 0) : null;
}

export function isActive(pathname: string, href: string): boolean {
  if (href === "/" || href === "/admin") return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}
