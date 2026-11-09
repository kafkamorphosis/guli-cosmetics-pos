"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { uz } from "@/lib/i18n/uz";
import type { ActionResult } from "./actions";

// app_secrets has no client grants: every read/write here goes through the service key after an
// admin check, and the token itself never goes back to the browser.

export type TelegramSettings = { tokenHint: string | null; chatId: string | null; enabled: boolean };
export type TelegramChat = { id: string; title: string };

const TOKEN_RE = /^\d{5,}:[A-Za-z0-9_-]{30,}$/;

function admin() {
  try {
    return supabaseAdmin();
  } catch {
    return null;
  }
}

async function readSecrets() {
  const sb = admin();
  if (!sb) return null;
  const { data } = await sb.from("app_secrets").select("telegram_bot_token, telegram_chat_id, telegram_enabled").single();
  return data as { telegram_bot_token: string | null; telegram_chat_id: string | null; telegram_enabled: boolean } | null;
}

export async function getTelegramSettings(): Promise<TelegramSettings> {
  await requireRole(["admin"]);
  const s = await readSecrets();
  const token = s?.telegram_bot_token ?? null;
  return { tokenHint: token ? `••••${token.slice(-4)}` : null, chatId: s?.telegram_chat_id ?? null, enabled: s?.telegram_enabled ?? false };
}

export async function saveTelegram(input: { token: string; chatId: string; enabled: boolean }): Promise<ActionResult> {
  await requireRole(["admin"]);
  const sb = admin();
  if (!sb) return { ok: false, error: uz.admin.missingKey };
  const token = input.token.trim();
  if (token && !TOKEN_RE.test(token)) return { ok: false, error: uz.admin.telegramTokenInvalid };
  // The switch can't be on while nothing could be sent.
  if (input.enabled && (!(token || (await readSecrets())?.telegram_bot_token) || !input.chatId.trim())) {
    return { ok: false, error: uz.admin.telegramNeedSetup };
  }
  const patch = {
    telegram_chat_id: input.chatId.trim() || null,
    telegram_enabled: input.enabled,
    updated_at: new Date().toISOString(),
    ...(token ? { telegram_bot_token: token } : {}),
  };
  const { error } = await sb.from("app_secrets").update(patch).eq("id", true);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/sozlamalar");
  return { ok: true };
}

async function telegram(token: string, method: string, body?: unknown): Promise<{ ok: boolean; result?: unknown; description?: string }> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  return res.json();
}

// Lists chats that have messaged the bot (after /start), so the admin can pick one without
// knowing what a chat id is.
export async function findTelegramChats(tokenInput: string): Promise<{ ok: true; chats: TelegramChat[] } | { ok: false; error: string }> {
  await requireRole(["admin"]);
  const token = tokenInput.trim() || (await readSecrets())?.telegram_bot_token || "";
  if (!TOKEN_RE.test(token)) return { ok: false, error: uz.admin.telegramTokenInvalid };
  try {
    const r = await telegram(token, "getUpdates");
    if (!r.ok) return { ok: false, error: r.description ?? uz.common.genericError };
    type Chat = { id: number; title?: string; first_name?: string; last_name?: string; username?: string };
    const chats = new Map<string, TelegramChat>();
    for (const u of (r.result as { message?: { chat: Chat }; my_chat_member?: { chat: Chat } }[]) ?? []) {
      const chat = u.message?.chat ?? u.my_chat_member?.chat;
      if (!chat) continue;
      const title = chat.title ?? ([chat.first_name, chat.last_name].filter(Boolean).join(" ") || chat.username || String(chat.id));
      chats.set(String(chat.id), { id: String(chat.id), title });
    }
    return { ok: true, chats: [...chats.values()] };
  } catch {
    return { ok: false, error: uz.common.genericError };
  }
}

// Tests what is in the form right now (falling back to what is saved), so it works before Save.
export async function sendTelegramTest(input: { token: string; chatId: string }): Promise<ActionResult> {
  await requireRole(["admin"]);
  const s = await readSecrets();
  const token = input.token.trim() || s?.telegram_bot_token || "";
  const chatId = input.chatId.trim() || s?.telegram_chat_id || "";
  if (!token || !chatId) return { ok: false, error: uz.admin.telegramNeedSetup };
  if (!TOKEN_RE.test(token)) return { ok: false, error: uz.admin.telegramTokenInvalid };
  try {
    const r = await telegram(token, "sendMessage", { chat_id: chatId, text: uz.admin.telegramTestText });
    return r.ok ? { ok: true } : { ok: false, error: r.description ?? uz.common.genericError };
  } catch {
    return { ok: false, error: uz.common.genericError };
  }
}
