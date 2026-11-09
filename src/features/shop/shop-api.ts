"use client";

import type { CartProduct } from "@/lib/domain/cart";
import type { ShippingRates } from "@/lib/domain/shipping";
import type { MyOrderWithItems } from "@/lib/data/seller";
import type { Destination } from "@/lib/domain/types";

// Browser side of /api/shop/*: every call carries Telegram's signed launch data instead of a session.

type TelegramWebApp = {
  initData: string;
  initDataUnsafe?: { user?: { first_name?: string; last_name?: string } };
  ready(): void;
  expand(): void;
  HapticFeedback?: { notificationOccurred(type: "success" | "error" | "warning"): void };
};

export function telegramApp(): TelegramWebApp | null {
  const tg = (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
  return tg && tg.initData ? tg : null;
}

export class ShopError extends Error {}

async function call<T>(initData: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": initData, ...init?.headers },
    signal: init?.signal ?? AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ShopError(body.error ?? "GENERIC");
  return body;
}

type CatalogRow = { id: string; name: string; photo_path: string | null; retail_price: number; weight_g: number; in_stock: boolean };

export async function fetchCatalog(initData: string, q: string, offset: number) {
  const r = await call<{ products: CatalogRow[]; more: boolean; rates: ShippingRates | null }>(
    initData,
    `/api/shop/catalog?q=${encodeURIComponent(q)}&offset=${offset}`,
  );
  const products: CartProduct[] = r.products.map((p) => ({
    id: p.id,
    barcode: "",
    name: p.name,
    photoPath: p.photo_path,
    retailPrice: p.retail_price,
    wholesalePrice: p.retail_price,
    weightG: p.weight_g,
    // Customers only learn whether it is in stock; the server checks real quantities on order.
    stock: p.in_stock ? 9_999 : 0,
  }));
  return { products, more: r.more, rates: r.rates };
}

export function placeOrder(
  initData: string,
  args: {
    requestId: string;
    items: { product_id: string; qty: number }[];
    phone: string;
    name: string;
    city: string;
    district: string;
    destination: Destination;
  },
) {
  return call<{ id: string; order_no: number }>(initData, "/api/shop/orders", { method: "POST", body: JSON.stringify(args) });
}

export async function fetchOrders(initData: string): Promise<MyOrderWithItems[]> {
  const r = await call<{ orders: MyOrderWithItems[] }>(initData, "/api/shop/orders");
  return r.orders.map((o) => ({ ...o, shipping_usd: Number(o.shipping_usd) }));
}
