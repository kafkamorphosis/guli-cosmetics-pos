"use server";

import { revalidatePath } from "next/cache";
import type { Role } from "@/lib/auth/home";
import { requireRole } from "@/lib/auth/session";
import { usernameToEmail } from "@/lib/auth/username";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { uz } from "@/lib/i18n/uz";
import { normalizeUsername, validatePassword, validateUsername } from "./validate";

export type ActionResult = { ok: true } | { ok: false; error: string };

const BANNED = "876000h"; // ~100 years

function fail(error: string): ActionResult {
  return { ok: false, error };
}

function admin() {
  try {
    return supabaseAdmin();
  } catch {
    return null;
  }
}

export async function createAccount(input: { username: string; fullName: string; password: string; role: Role }): Promise<ActionResult> {
  await requireRole(["admin"]);
  const username = normalizeUsername(input.username);
  const invalid = validateUsername(username) ?? validatePassword(input.password);
  if (invalid) return fail(invalid);
  const sb = admin();
  if (!sb) return fail(uz.admin.missingKey);

  const { error } = await sb.auth.admin.createUser({
    email: usernameToEmail(username),
    password: input.password,
    email_confirm: true,
    user_metadata: { username, full_name: input.fullName.trim() },
    // Only app_metadata grants a role; see supabase/migrations/*_signup_role_from_app_metadata.sql.
    app_metadata: { role: input.role },
  });
  if (error) return fail(error.code === "email_exists" ? uz.admin.usernameTaken : error.message);
  revalidatePath("/admin");
  return { ok: true };
}

export async function resetPassword(userId: string, password: string): Promise<ActionResult> {
  await requireRole(["admin"]);
  const invalid = validatePassword(password);
  if (invalid) return fail(invalid);
  const sb = admin();
  if (!sb) return fail(uz.admin.missingKey);
  const { error } = await sb.auth.admin.updateUserById(userId, { password });
  return error ? fail(error.message) : { ok: true };
}

export async function setRole(userId: string, role: Role): Promise<ActionResult> {
  const me = await requireRole(["admin"]);
  if (userId === me.id && role !== "admin") return fail(uz.admin.cannotChangeSelf);
  const sb = admin();
  if (!sb) return fail(uz.admin.missingKey);
  // app_metadata is the source of the role; the on_auth_user_role_changed trigger updates the
  // profile and never re-enables a disabled account.
  const { error } = await sb.auth.admin.updateUserById(userId, { app_metadata: { role } });
  if (error) return fail(error.message);
  revalidatePath("/admin");
  return { ok: true };
}

export async function setActive(userId: string, active: boolean): Promise<ActionResult> {
  const me = await requireRole(["admin"]);
  if (userId === me.id && !active) return fail(uz.admin.cannotChangeSelf);
  const sb = admin();
  if (!sb) return fail(uz.admin.missingKey);
  // Ban first so a disabled user can't sign in again; is_active stops existing sessions at the RLS layer.
  const { error: banError } = await sb.auth.admin.updateUserById(userId, { ban_duration: active ? "none" : BANNED });
  if (banError) return fail(banError.message);
  const { error } = await sb.from("profiles").update({ is_active: active }).eq("id", userId);
  if (error) return fail(error.message);
  revalidatePath("/admin");
  return { ok: true };
}

export async function updateSettings(input: { krShippingKrw: number; uzShippingUsdPerKg: number }): Promise<ActionResult> {
  await requireRole(["admin"]);
  const kr = Math.round(input.krShippingKrw);
  const uzRate = Math.round(input.uzShippingUsdPerKg * 100) / 100;
  if (!(kr >= 0) || !(uzRate >= 0)) return fail(uz.errors.INVALID_QTY);
  const sb = await supabaseServer();
  const { error } = await sb.from("app_settings").update({ kr_shipping_krw: kr, uz_shipping_usd_per_kg: uzRate }).eq("id", true);
  if (error) return fail(error.message);
  revalidatePath("/admin/sozlamalar");
  return { ok: true };
}
