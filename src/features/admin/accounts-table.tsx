"use client";

import { useState, useTransition } from "react";
import { KeyRound, Plus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { Profile } from "@/lib/database.types";
import { formatDateTime } from "@/lib/domain/dates";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";
import { setActive, setRole, type ActionResult } from "./actions";
import { NewAccountDialog, ResetPasswordDialog, RoleSelect } from "./account-dialog";

export function AccountsTable({ profiles, meId }: { profiles: Profile[]; meId: string }) {
  const [creating, setCreating] = useState(false);
  const [resetFor, setResetFor] = useState<Profile | null>(null);
  const [pending, start] = useTransition();

  function run(action: () => Promise<ActionResult>) {
    start(async () => {
      const r = await action();
      if (!r.ok) toast.error(r.error);
    });
  }

  return (
    <>
      <PageHeader title={uz.admin.accountsTitle}>
        <Button onClick={() => setCreating(true)}>
          <Plus aria-hidden />
          {uz.admin.newAccount}
        </Button>
      </PageHeader>

      <div className="waybill overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-ink bg-paper text-left">
            <tr>
              <th className="caption px-3 py-2">{uz.admin.username}</th>
              <th className="caption px-3 py-2">{uz.admin.fullName}</th>
              <th className="caption w-44 px-3 py-2">{uz.admin.role}</th>
              <th className="caption w-20 px-3 py-2">{uz.admin.active}</th>
              <th className="caption hidden px-3 py-2 md:table-cell">{uz.admin.created}</th>
              <th className="w-12 px-3 py-2">
                <span className="sr-only">{uz.admin.resetPassword}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => (
              <tr key={p.id} className={cn("border-b border-rule-soft last:border-0", !p.is_active && "text-ink-3")}>
                <td className="px-3 py-2 font-semibold">
                  {p.username}
                  {!p.is_active && (
                    <span className="ml-2 rounded-sm bg-muted px-1.5 py-0.5 text-caption font-semibold text-ink-3">
                      {uz.admin.disabledBadge}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">{p.full_name}</td>
                <td className="px-3 py-2">
                  <RoleSelect
                    value={p.role}
                    label={`${uz.admin.role}: ${p.username}`}
                    disabled={pending || p.id === meId}
                    onChange={(role) => run(() => setRole(p.id, role))}
                  />
                </td>
                <td className="px-3 py-2">
                  <Switch
                    checked={p.is_active}
                    disabled={pending || p.id === meId}
                    onCheckedChange={(v) => run(() => setActive(p.id, v))}
                    aria-label={`${uz.admin.active}: ${p.username}`}
                  />
                </td>
                <td className="num hidden px-3 py-2 text-ink-2 md:table-cell">{formatDateTime(p.created_at)}</td>
                <td className="px-2 py-2">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setResetFor(p)}
                    aria-label={`${uz.admin.resetPassword}: ${p.username}`}
                  >
                    <KeyRound aria-hidden />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <NewAccountDialog open={creating} onOpenChange={setCreating} />
      <ResetPasswordDialog
        userId={resetFor?.id ?? null}
        username={resetFor?.username ?? ""}
        onClose={() => setResetFor(null)}
      />
    </>
  );
}
