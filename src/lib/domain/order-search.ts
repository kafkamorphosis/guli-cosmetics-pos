import { normalizePhone } from "./phone";

export type OrderSearch =
  | { kind: "orderNo"; value: number }
  | { kind: "phone"; value: string }
  | { kind: "name"; value: string };

export function parseOrderSearch(raw: string): OrderSearch | null {
  const q = raw.trim();
  if (!q) return null;
  if (/^#?\d{1,7}$/.test(q)) return { kind: "orderNo", value: Number(q.replace("#", "")) };
  const phone = normalizePhone(q, "KR");
  if (phone) return { kind: "phone", value: phone };
  return { kind: "name", value: q };
}
