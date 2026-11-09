"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

// Client-only: the cart restores from sessionStorage and the Telegram SDK lives on window.
export const ShopLoader = dynamic(() => import("./shop-screen").then((m) => m.ShopScreen), {
  ssr: false,
  loading: () => <Skeleton className="min-h-dvh rounded-none" />,
});
