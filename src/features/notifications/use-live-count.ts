"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { supabaseBrowser } from "@/lib/supabase/client";

// Live count for a nav badge: changes to `table` on any device, reconnects and window focus refresh it.
export function useLiveCount(
  enabled: boolean,
  table: "products" | "orders",
  count: (sb: SupabaseClient<Database>) => Promise<number>,
): number | null {
  const [value, setValue] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const sb = supabaseBrowser();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () =>
      count(sb)
        .then(setValue)
        .catch(() => {});
    const channel = sb
      .channel(`badge-${table}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, () => {
        clearTimeout(timer);
        timer = setTimeout(refresh, 400);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") refresh();
      });
    const onFocus = () => document.visibilityState === "visible" && refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      sb.removeChannel(channel);
    };
  }, [enabled, table, count]);

  return enabled ? value : null;
}
