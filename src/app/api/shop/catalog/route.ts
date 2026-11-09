import type { NextRequest } from "next/server";
import { jsonError, SHOP_PAGE, shopUserFrom } from "@/lib/shop/server";
import { supabaseAdmin } from "@/lib/supabase/admin";


// GET /api/shop/catalog?q=&offset= — products for the shop, plus shipping rates on the first page.
export async function GET(request: NextRequest) {
  if (!(await shopUserFrom(request))) return jsonError("NOT_AUTHORIZED", 401);
  const q = (request.nextUrl.searchParams.get("q") ?? "").slice(0, 100);
  const offset = Math.max(0, Math.min(10_000, Number(request.nextUrl.searchParams.get("offset")) || 0));
  const sb = supabaseAdmin();
  const [products, settings] = await Promise.all([
    sb.rpc("shop_catalog", { p_query: q.trim() || null, p_limit: SHOP_PAGE, p_offset: offset }),
    offset === 0 ? sb.from("app_settings").select("kr_shipping_krw, uz_shipping_usd_per_kg").single() : null,
  ]);
  if (products.error) return jsonError("GENERIC", 500);
  return Response.json(
    {
      products: products.data ?? [],
      more: (products.data ?? []).length === SHOP_PAGE,
      rates: settings?.data
        ? { krShippingKrw: settings.data.kr_shipping_krw, uzShippingUsdPerKg: Number(settings.data.uz_shipping_usd_per_kg) }
        : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
