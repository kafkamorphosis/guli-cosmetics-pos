"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, LogOut } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { uz } from "@/lib/i18n/uz";

export function MobileHeader({ name }: { name: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const atHome = pathname === "/mobil";

  async function signOut() {
    await supabaseBrowser().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-ink bg-cell px-2">
      {atHome ? (
        <div className="flex min-w-0 items-center gap-2 px-2">
          <Image src="/brand/guli-mark.png" alt="" width={36} height={36} priority />
          <div className="min-w-0 leading-tight">
            <p className="font-bold">{uz.brand}</p>
            <p className="truncate text-xs text-ink-2">{name}</p>
          </div>
        </div>
      ) : (
        <Link href="/mobil" className="flex h-12 items-center gap-1 rounded-md px-2 text-lg font-bold active:bg-paper">
          <ChevronLeft className="size-7" aria-hidden />
          {uz.mobile.home}
        </Link>
      )}
      {atHome && (
        <button
          type="button"
          onClick={signOut}
          className="ml-auto flex h-12 items-center gap-2 rounded-md px-3 text-sm font-semibold text-ink-2 active:bg-paper"
        >
          <LogOut className="size-5" aria-hidden />
          {uz.mobile.logout}
        </button>
      )}
    </header>
  );
}
