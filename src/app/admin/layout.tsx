import { AppShell } from "@/components/shell/app-shell";
import { requireRole } from "@/lib/auth/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole(["admin"]);
  return (
    <AppShell navKey="admin" user={{ fullName: profile.fullName || profile.username, role: profile.role }}>
      {children}
    </AppShell>
  );
}
