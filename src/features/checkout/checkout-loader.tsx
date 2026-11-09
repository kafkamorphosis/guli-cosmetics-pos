"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

// Client-only: the cart restores from sessionStorage on first render.
export const CheckoutLoader = dynamic(() => import("./checkout-screen").then((m) => m.CheckoutScreen), {
  ssr: false,
  loading: () => <Skeleton className="min-h-[70dvh] flex-1 rounded-lg border border-ink" />,
});
