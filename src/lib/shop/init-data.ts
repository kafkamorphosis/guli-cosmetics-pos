import { createHmac, timingSafeEqual } from "node:crypto";

// Telegram Mini App sign-in: Telegram signs the launch data (initData) with the bot token, so the
// server can trust the user id in it without any password. Spec:
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app

export type ShopUser = { id: number; firstName: string; lastName?: string; username?: string };

/** How long a signed launch stays valid; a customer who keeps the shop open longer reopens it. */
export const INIT_DATA_MAX_AGE_S = 24 * 60 * 60;

export function signInitData(fields: Record<string, string>, botToken: string): string {
  const check = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  return createHmac("sha256", secret).update(check).digest("hex");
}

export function verifyInitData(initData: string, botToken: string, nowS = Math.floor(Date.now() / 1000)): ShopUser | null {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return null;
  const fields: Record<string, string> = {};
  for (const [k, v] of params) if (k !== "hash") fields[k] = v;

  const expected = Buffer.from(signInitData(fields, botToken), "hex");
  if (!timingSafeEqual(expected, Buffer.from(hash, "hex"))) return null;

  const authDate = Number(fields.auth_date);
  if (!Number.isFinite(authDate) || nowS - authDate > INIT_DATA_MAX_AGE_S || authDate - nowS > 300) return null;

  try {
    const u = JSON.parse(fields.user ?? "null") as { id?: unknown; first_name?: unknown; last_name?: unknown; username?: unknown } | null;
    if (!u || typeof u.id !== "number" || !Number.isSafeInteger(u.id)) return null;
    return {
      id: u.id,
      firstName: typeof u.first_name === "string" ? u.first_name : "",
      lastName: typeof u.last_name === "string" ? u.last_name : undefined,
      username: typeof u.username === "string" ? u.username : undefined,
    };
  } catch {
    return null;
  }
}
