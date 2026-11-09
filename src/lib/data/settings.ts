import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { ShippingRates } from "@/lib/domain/shipping";

export async function getShippingRates(sb: SupabaseClient<Database>): Promise<ShippingRates> {
  const { data, error } = await sb.from("app_settings").select("kr_shipping_krw, uz_shipping_usd_per_kg").single();
  if (error) throw error;
  return { krShippingKrw: data.kr_shipping_krw, uzShippingUsdPerKg: Number(data.uz_shipping_usd_per_kg) };
}
