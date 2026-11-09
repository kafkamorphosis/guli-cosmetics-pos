"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, MoreHorizontal, WifiOff } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useLiveCount } from "@/features/notifications/use-live-count";
import { countLowStock, countPending } from "@/lib/data/notifications";
import { supabaseBrowser } from "@/lib/supabase/client";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";
import { F_KEYS, fKeyRoute } from "./fkeys";
import { NAV, badgeCount, isActive, type NavItem, type NavKey } from "./nav-items";
import { useOnline } from "./use-online";
import type { Role } from "@/lib/auth/home";

type ShellUser = { fullName: string; role: Role };

function Badge({ count, inverted }: { count: number | null; inverted?: boolean }) {
  if (!count) return null;
  return (
    <span
      aria-label={uz.notifications.badge(count)}
      className={cn(
        "num min-w-5 rounded-full px-1.5 text-center text-[0.7rem] leading-5 font-bold",
        inverted ? "bg-cell text-ink" : "bg-ink text-cell",
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

// Bottom-bar badge: pinned to the icon's top-right corner, clear of the icon itself.
function NavBadge({ count, inverted }: { count: number | null; inverted?: boolean }) {
  if (!count) return null;
  return (
    <span className="absolute top-1 left-[calc(50%+0.75rem)]">
      <Badge count={count} inverted={inverted} />
    </span>
  );
}

export function AppShell({ navKey, user, children }: { navKey: NavKey; user: ShellUser; children: React.ReactNode }) {
  const nav = NAV[navKey];
  const pathname = usePathname();
  const router = useRouter();
  const online = useOnline();
  const lowStock = useLiveCount(nav.some((i) => i.badge?.includes("lowStock")), "products", countLowStock);
  const pending = useLiveCount(nav.some((i) => i.badge?.includes("pending")), "orders", countPending);
  const [moreOpen, setMoreOpen] = useState(false);
  const badgeFor = (item: NavItem) => badgeCount(item, { lowStock, pending });

  const barItems = nav.filter((i) => !i.more);
  const moreItems = nav.filter((i) => i.more);
  const moreActive = moreItems.some((i) => isActive(pathname, i.href));
  const moreBadge = moreItems.reduce((n, i) => n + (badgeFor(i) ?? 0), 0);

  // F1–F4 jump between the store screens (managers). F1 on Kassa is left to Kassa: it focuses the scan field.
  const fKeys = navKey === "pos";
  useEffect(() => {
    if (!fKeys) return;
    function onKey(e: KeyboardEvent) {
      const route = fKeyRoute(e.key);
      if (!route || e.ctrlKey || e.altKey || e.metaKey) return;
      e.preventDefault();
      if (route !== pathname) router.push(route);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fKeys, pathname, router]);

  async function signOut() {
    await supabaseBrowser().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 flex h-13 items-stretch border-b border-ink bg-cell">
        <Link href={nav[0].href} className="flex items-center gap-2.5 border-r border-ink px-4" aria-label={uz.brand}>
          <Image src="/brand/guli-mark.png" alt="" width={28} height={28} priority />
          <span className="text-[0.95rem] font-bold tracking-tight">{uz.brand}</span>
        </Link>
        <nav aria-label="Asosiy" className="hidden items-stretch md:flex">
          {nav.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                title={fKeys && F_KEYS[item.href] ? `${item.label} (${F_KEYS[item.href]})` : item.label}
                className={cn(
                  "flex items-center gap-2 border-r border-ink px-4 text-sm font-semibold transition-colors duration-150 xl:px-5",
                  active ? "bg-ink text-cell" : "text-ink hover:bg-paper",
                )}
              >
                <item.icon className="size-4" aria-hidden />
                {/* Icons only on narrower screens so every destination fits beside the logo. */}
                <span className={cn(nav.length > 6 ? "sr-only 2xl:not-sr-only" : nav.length > 4 && "sr-only xl:not-sr-only")}>{item.label}</span>
                {fKeys && F_KEYS[item.href] && (
                  <kbd className={cn("num hidden rounded-sm border px-1 text-[0.65rem] leading-4 font-semibold xl:inline", active ? "border-cell/40 text-cell/80" : "border-rule-soft text-ink-3")}>
                    {F_KEYS[item.href]}
                  </kbd>
                )}
                <Badge count={badgeFor(item)} inverted={active} />
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-stretch">
          <div className="hidden flex-col justify-center border-l border-ink px-4 leading-tight lg:flex">
            <span className="text-sm font-semibold">{user.fullName}</span>
            <span className="caption">{uz.roles[user.role]}</span>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="flex items-center gap-2 border-l border-ink px-4 text-sm font-semibold hover:bg-paper"
          >
            <LogOut className="size-4" aria-hidden />
            <span className="hidden sm:inline">{uz.common.signOut}</span>
            <span className="sr-only sm:hidden">{uz.common.signOut}</span>
          </button>
        </div>
      </header>

      {!online && (
        <div role="status" className="sticky top-13 z-30 flex items-center gap-2 border-b border-warn/40 bg-warn-soft px-4 py-2 text-sm font-medium text-warn">
          <WifiOff className="size-4" aria-hidden />
          {uz.common.offline}
        </div>
      )}

      <main className="flex min-w-0 flex-1 flex-col px-3 pt-4 pb-[calc(6rem+env(safe-area-inset-bottom))] md:px-6 md:pt-6 md:pb-8">{children}</main>

      <nav
        aria-label="Asosiy"
        className="fixed inset-x-0 bottom-0 z-40 grid border-t border-ink bg-cell pb-[env(safe-area-inset-bottom)] md:hidden"
        style={{ gridTemplateColumns: `repeat(${barItems.length + (moreItems.length ? 1 : 0)}, minmax(0, 1fr))` }}
      >
        {barItems.map((item, i) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex h-16 flex-col items-center justify-center gap-1 text-[0.72rem] font-semibold",
                i > 0 && "border-l border-ink",
                active ? "bg-ink text-cell" : "text-ink",
              )}
            >
              <item.icon className="size-5" aria-hidden />
              <span className="max-w-full truncate px-0.5">{item.label}</span>
              <NavBadge count={badgeFor(item)} inverted={active} />
            </Link>
          );
        })}
        {moreItems.length > 0 && (
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-expanded={moreOpen}
            className={cn(
              "relative flex h-16 flex-col items-center justify-center gap-1 border-l border-ink text-[0.72rem] font-semibold",
              moreActive ? "bg-ink text-cell" : "text-ink",
            )}
          >
            <MoreHorizontal className="size-5" aria-hidden />
            {uz.nav.more}
            <NavBadge count={moreBadge} inverted={moreActive} />
          </button>
        )}
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="gap-0 border-t border-ink p-0 md:hidden">
          <SheetHeader className="border-b border-ink px-4 py-3">
            <SheetTitle>{uz.nav.more}</SheetTitle>
            <SheetDescription className="sr-only">{uz.nav.more}</SheetDescription>
          </SheetHeader>
          <ul className="pb-[env(safe-area-inset-bottom)]">
            {moreItems.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href} className="border-b border-rule-soft last:border-0">
                  <Link
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn("flex h-14 items-center gap-3 px-4 text-base font-semibold", active && "bg-ink text-cell")}
                  >
                    <item.icon className="size-5" aria-hidden />
                    <span className="flex-1">{item.label}</span>
                    <Badge count={badgeFor(item)} inverted={active} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </SheetContent>
      </Sheet>
    </div>
  );
}
