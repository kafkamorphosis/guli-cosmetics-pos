"use client";

import { useEffect, useState } from "react";
import { listSellers } from "@/lib/data/orders";
import { supabaseBrowser } from "@/lib/supabase/client";
import { uz } from "@/lib/i18n/uz";

// Manager: "" = everyone, "me" = own, otherwise a seller id. Sellers are always scoped to themselves
// by the database; the value sent is irrelevant for them.
export function resolveScope(isManager: boolean, meId: string, param: string | null) {
  const scope = isManager ? (param ?? "") : "me";
  const sellerId = scope === "" ? null : scope === "me" ? meId : scope;
  return { scope, sellerId };
}

export function ScopeSelect({
  isManager,
  meId,
  value,
  onChange,
}: {
  isManager: boolean;
  meId: string;
  value: string;
  onChange(scope: string): void;
}) {
  const [sellers, setSellers] = useState<{ id: string; full_name: string; username: string }[]>([]);

  useEffect(() => {
    if (isManager) listSellers(supabaseBrowser()).then(setSellers).catch(() => {});
  }, [isManager]);

  if (!isManager) return <span className="caption">{uz.analytics.mineCaption}</span>;
  return (
    <label className="flex items-center gap-2 text-sm text-ink-2">
      {uz.analytics.scope}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 rounded-sm border border-input bg-cell px-2 text-sm font-semibold text-ink"
      >
        <option value="">{uz.analytics.all}</option>
        <option value="me">{uz.analytics.mine}</option>
        {sellers
          .filter((s) => s.id !== meId)
          .map((s) => (
            <option key={s.id} value={s.id}>
              {s.full_name || s.username}
            </option>
          ))}
      </select>
    </label>
  );
}
