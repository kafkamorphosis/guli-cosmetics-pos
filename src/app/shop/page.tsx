import type { Metadata } from "next";
import { ShopLoader } from "@/features/shop/shop-loader";
import { uz } from "@/lib/i18n/uz";

export const metadata: Metadata = { title: { absolute: uz.shop.title } };

// The Telegram Mini App. Customers reach it from the shop bot; there is no staff login here.
export default function ShopPage() {
  return <ShopLoader />;
}
