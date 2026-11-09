"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

// Client-only: the cart restores from sessionStorage on first render.
export const SellLoader = dynamic(() => import("./sell-screen").then((m) => m.SellScreen), {
  ssr: false,
  loading: () => <Skeleton className="min-h-[70dvh] flex-1 rounded-lg border border-ink" />,
});
