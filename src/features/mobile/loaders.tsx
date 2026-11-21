"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

// Client-only: the cart restores from sessionStorage and the scanners need the camera.
const loading = () => <Skeleton className="m-3 min-h-[60dvh] flex-1 rounded-none" />;
export const MobileSellLoader = dynamic(() => import("./mobile-sell").then((m) => m.MobileSell), { ssr: false, loading });
export const MobilePhotoLoader = dynamic(() => import("./mobile-photo").then((m) => m.MobilePhoto), { ssr: false, loading });
