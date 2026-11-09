"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireRole } from "@/lib/auth/session";
import { telegramApi } from "@/lib/shop/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { uz } from "@/lib/i18n/uz";
import type { ActionResult } from "./actions";

export type ShopBotSettings = { tokenHint: string | null; botUsername: string | null };

const TOKEN_RE = /^\d{5,}:[A-Za-z0-9_-]{30,}$/;

function admin() {
  try {
    return supabaseAdmin();
  } catch {
    return null;
  }
}

export async function getShopBotSettings(): Promise<ShopBotSettings> {
  await requireRole(["admin"]);
  const sb = admin();
  const { data } = sb ? await sb.from("app_secrets").select("shop_bot_token").single() : { data: null };
  const token = data?.shop_bot_token ?? null;
  let botUsername: string | null = null;
  if (token) {
    const me = await telegramApi(token, "getMe").catch(() => null);
    botUsername = me?.ok ? ((me.result as { username?: string }).username ?? null) : null;
  }
  return { tokenHint: token ? `••••${token.slice(-4)}` : null, botUsername };
}

// The public address of this app, as the browser that called this action reached it.
async function siteOrigin(): Promise<string | null> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return null;
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

// Saves the shop bot and points it at this app: the webhook answers /start with the shop button,
// and the chat's menu button opens the shop directly.
export async function connectShopBot(input: { token: string }): Promise<ActionResult> {
  await requireRole(["admin"]);
  const sb = admin();
  if (!sb) return { ok: false, error: uz.admin.missingKey };
  const typed = input.token.trim();
  if (typed && !TOKEN_RE.test(typed)) return { ok: false, error: uz.admin.telegramTokenInvalid };
  const token = typed || (await sb.from("app_secrets").select("shop_bot_token").single()).data?.shop_bot_token || "";
  if (!token) return { ok: false, error: uz.shop.adminNeedToken };

  const origin = await siteOrigin();
  if (!origin || !origin.startsWith("https://")) return { ok: false, error: uz.shop.adminNeedHttps };

  const secret = randomBytes(24).toString("hex");
  try {
    const hook = await telegramApi(token, "setWebhook", {
      url: `${origin}/api/telegram/shop`,
      secret_token: secret,
      allowed_updates: ["message"],
      drop_pending_updates: true,
    });
    if (!hook.ok) return { ok: false, error: hook.description ?? uz.common.genericError };
    await telegramApi(token, "setChatMenuButton", {
      menu_button: { type: "web_app", text: uz.shop.menuButton, web_app: { url: `${origin}/shop` } },
    });
    await telegramApi(token, "setMyCommands", { commands: [{ command: "start", description: uz.shop.startCommand }] });
  } catch {
    return { ok: false, error: uz.common.genericError };
  }

  const { error } = await sb
    .from("app_secrets")
    .update({ shop_bot_token: token, shop_webhook_secret: secret, updated_at: new Date().toISOString() })
    .eq("id", true);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/sozlamalar");
  return { ok: true };
}
