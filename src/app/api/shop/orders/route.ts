import { jsonError, shopUserFrom } from "@/lib/shop/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHONE = /^\+[1-9][0-9]{7,14}$/;

// GET /api/shop/orders — the signed-in customer's own orders (newest first, with items).
export async function GET(request: Request) {
  const user = await shopUserFrom(request);
  if (!user) return jsonError("NOT_AUTHORIZED", 401);
  const { data, error } = await supabaseAdmin().rpc("shop_my_orders", { p_telegram_user_id: user.id, p_limit: 30 });
  if (error) return jsonError("GENERIC", 500);
  return Response.json({ orders: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}

type Body = {
  requestId?: unknown;
  items?: unknown;
  phone?: unknown;
  name?: unknown;
  city?: unknown;
  district?: unknown;
  destination?: unknown;
};

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// POST /api/shop/orders — places a pending order. Retrying with the same requestId is safe.
export async function POST(request: Request) {
  const user = await shopUserFrom(request);
  if (!user) return jsonError("NOT_AUTHORIZED", 401);
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return jsonError("EMPTY_CART", 400);
  }

  const requestId = str(body.requestId, 36);
  if (!UUID.test(requestId)) return jsonError("GENERIC", 400);
  const destination = body.destination === "UZ" ? "UZ" : body.destination === "KR" ? "KR" : null;
  if (!destination) return jsonError("TEKPE_NEEDS_DESTINATION", 400);
  const phone = str(body.phone, 20);
  if (!PHONE.test(phone)) return jsonError("INVALID_PHONE", 400);

  const raw = Array.isArray(body.items) ? body.items.slice(0, 100) : [];
  const items = raw.flatMap((i) => {
    const it = i as { product_id?: unknown; qty?: unknown };
    return typeof it.product_id === "string" && UUID.test(it.product_id) && Number.isInteger(it.qty) && (it.qty as number) > 0 && (it.qty as number) <= 999
      ? [{ product_id: it.product_id, qty: it.qty as number }]
      : [];
  });
  if (items.length === 0 || items.length !== raw.length) return jsonError(items.length ? "INVALID_QTY" : "EMPTY_CART", 400);

  const { data, error } = await supabaseAdmin().rpc("submit_shop_order", {
    p_request_id: requestId,
    p_telegram_user_id: user.id,
    p_items: items,
    p_customer_phone: phone,
    p_customer_name: str(body.name, 120),
    p_city: str(body.city, 120),
    p_district: str(body.district, 120),
    p_destination: destination,
  });
  if (error) {
    // Database errors are bare codes (see uz.errors); anything else stays generic.
    const code = /^[A-Z_]+$/.test(error.message) ? error.message : "GENERIC";
    return jsonError(code, code === "GENERIC" ? 500 : 400);
  }
  return Response.json({ id: data.id, order_no: data.order_no }, { headers: { "Cache-Control": "no-store" } });
}
