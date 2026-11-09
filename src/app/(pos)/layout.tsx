import { AppShell } from "@/components/shell/app-shell";
import { navKeyFor } from "@/lib/auth/home";
import { requireRole } from "@/lib/auth/session";

export default async function PosLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole(["manager", "seller"]);
  return (
    <AppShell navKey={navKeyFor(profile.role)} user={{ fullName: profile.fullName || profile.username, role: profile.role }}>
      {children}
    </AppShell>
  );
}
