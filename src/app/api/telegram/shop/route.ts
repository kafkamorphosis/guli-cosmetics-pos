import { timingSafeEqual } from "node:crypto";
import { readShopSecrets, telegramApi } from "@/lib/shop/server";
import { shopWelcome } from "@/lib/shop/texts";

// Telegram calls this for every message to the shop bot (set up from Admin → Sozlamalar). It only
// answers with the button that opens the shop; ordering happens inside the Mini App.
export async function POST(request: Request) {
  const { token, webhookSecret } = await readShopSecrets();
  const got = Buffer.from(request.headers.get("x-telegram-bot-api-secret-token") ?? "");
  const want = Buffer.from(webhookSecret ?? "");
  if (!token || !webhookSecret || got.length !== want.length || !timingSafeEqual(got, want)) {
    return new Response("forbidden", { status: 403 });
  }

  type Update = { message?: { chat?: { id?: number; type?: string }; from?: { first_name?: string } } };
  const update = (await request.json().catch(() => null)) as Update | null;
  const chat = update?.message?.chat;
  if (chat?.id && chat.type === "private") {
    const shopUrl = new URL("/shop", request.url).toString();
    await telegramApi(token, "sendMessage", {
      chat_id: chat.id,
      text: shopWelcome(update?.message?.from?.first_name),
      reply_markup: { inline_keyboard: [[{ text: "🛍 Doʻkonni ochish", web_app: { url: shopUrl } }]] },
    }).catch(() => undefined);
  }
  // Always 200 so Telegram doesn't retry the same update.
  return new Response("ok");
}
