import type { Metadata } from "next";
import { AccountsTable } from "@/features/admin/accounts-table";
import { requireRole } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase/server";
import { uz } from "@/lib/i18n/uz";

export const metadata: Metadata = { title: uz.admin.accountsTitle };

export default async function AdminPage() {
  const me = await requireRole(["admin"]);
  const sb = await supabaseServer();
  const { data: profiles } = await sb.from("profiles").select("*").order("created_at");
  return <AccountsTable profiles={profiles ?? []} meId={me.id} />;
}
