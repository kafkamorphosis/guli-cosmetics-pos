import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

const BUCKET = "product-photos";

export function photoUrl(path: string | null): string | null {
  if (!path) return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

export async function uploadProductPhoto(sb: SupabaseClient<Database>, productId: string, file: Blob): Promise<string> {
  const path = `products/${productId}/${Date.now()}.jpg`;
  const { error } = await sb.storage.from(BUCKET).upload(path, file, { contentType: "image/jpeg", upsert: false });
  if (error) throw error;
  return path;
}
