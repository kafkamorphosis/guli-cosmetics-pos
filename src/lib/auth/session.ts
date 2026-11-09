import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { homeFor, type Role } from "./home";

export type SessionProfile = {
  id: string;
  username: string;
  fullName: string;
  role: Role;
};

// One lookup per request, shared by layouts and pages.
export const getSessionProfile = cache(async (): Promise<SessionProfile | null> => {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getClaims();
  if (!auth?.claims.sub) return null;
  const { data } = await sb
    .from("profiles")
    .select("id, username, full_name, role, is_active")
    .eq("id", auth.claims.sub)
    .maybeSingle();
  if (!data || !data.is_active) return null;
  return { id: data.id, username: data.username, fullName: data.full_name, role: data.role };
});

export async function requireRole(roles: SessionProfile["role"][]): Promise<SessionProfile> {
  const profile = await getSessionProfile();
  if (!profile) redirect("/login");
  if (!roles.includes(profile.role)) redirect(homeFor(profile.role));
  return profile;
}
