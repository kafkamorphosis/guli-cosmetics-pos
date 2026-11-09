import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifyInitData, type ShopUser } from "./init-data";

// Everything the shop does goes through the service key after the Telegram signature check: the
// shop RPCs are granted to service_role only, and customers never get a Supabase session.

export const SHOP_PAGE = 60;
export const INIT_DATA_HEADER = "x-telegram-init-data";

export type ShopSecrets = { token: string | null; webhookSecret: string | null };

export async function readShopSecrets(): Promise<ShopSecrets> {
  const { data } = await supabaseAdmin().from("app_secrets").select("shop_bot_token, shop_webhook_secret").single();
  return { token: data?.shop_bot_token ?? null, webhookSecret: data?.shop_webhook_secret ?? null };
}

export async function shopUserFrom(request: Request): Promise<ShopUser | null> {
  const initData = request.headers.get(INIT_DATA_HEADER) ?? "";
  if (!initData) return null;
  const { token } = await readShopSecrets();
  return token ? verifyInitData(initData, token) : null;
}

export function jsonError(code: string, status: number) {
  return Response.json({ error: code }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function telegramApi(token: string, method: string, body?: unknown): Promise<{ ok: boolean; result?: unknown; description?: string }> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  return res.json();
}
