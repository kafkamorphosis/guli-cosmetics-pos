import Link from "next/link";
import { Camera, ScanBarcode } from "lucide-react";
import { uz } from "@/lib/i18n/uz";

export default function MobileHome() {
  const tiles = [
    { href: "/mobil/sotish", icon: ScanBarcode, title: uz.mobile.sell, hint: uz.mobile.sellHint, tone: "bg-sand" },
    { href: "/mobil/rasm", icon: Camera, title: uz.mobile.photo, hint: uz.mobile.photoHint, tone: "bg-cell" },
  ];
  return (
    <main className="grid flex-1 grid-rows-2 gap-4 p-4">
      {tiles.map(({ href, icon: Icon, title, hint, tone }) => (
        <Link
          key={href}
          href={href}
          className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-ink ${tone} p-6 text-center transition-transform active:scale-[0.98]`}
        >
          <Icon className="size-20" strokeWidth={1.5} aria-hidden />
          <span className="text-4xl font-extrabold tracking-tight">{title}</span>
          <span className="text-base text-ink-2">{hint}</span>
        </Link>
      ))}
    </main>
  );
}
