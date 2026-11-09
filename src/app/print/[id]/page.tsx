import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AutoPrint } from "@/features/print/autoprint";
import { OrderSheet } from "@/features/print/order-sheet";
import { PrintButton } from "@/features/print/print-button";
import { requireRole } from "@/lib/auth/session";
import { getOrderWithItems } from "@/lib/data/orders";
import { formatOrderNo } from "@/lib/domain/order-no";
import { supabaseServer } from "@/lib/supabase/server";
import { uz } from "@/lib/i18n/uz";
import "../print.css";

export async function generateMetadata({ params }: PageProps<"/print/[id]">): Promise<Metadata> {
  const { id } = await params;
  const order = await getOrderWithItems(await supabaseServer(), id).catch(() => null);
  return { title: { absolute: order ? formatOrderNo(order.order_no) : uz.sheet.notFound } };
}

export default async function PrintPage({ params, searchParams }: PageProps<"/print/[id]">) {
  await requireRole(["manager"]);
  const { id } = await params;
  const { autoprint } = await searchParams;
  const order = await getOrderWithItems(await supabaseServer(), id).catch(() => null);
  if (!order) notFound();
  // A pending seller order has taken no stock yet and may still be rejected: no parcel sheet.
  if (order.box_id) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-lg font-bold">{uz.sheet.boxedTitle(formatOrderNo(order.order_no))}</p>
        <Button asChild variant="outline" className="mt-6">
          <Link href={`/print/box/${order.box_id}`}>{uz.sheet.openBoxList}</Link>
        </Button>
      </div>
    );
  }
  if (order.status === "pending") {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-lg font-bold">{uz.sheet.pendingTitle(formatOrderNo(order.order_no))}</p>
        <p className="mt-2 text-ink-2">{uz.sheet.pendingHint}</p>
        <Button asChild variant="outline" className="mt-6">
          <Link href={`/buyurtmalar/${order.id}`}>
            <ArrowLeft aria-hidden />
            {uz.sheet.backToOrder}
          </Link>
        </Button>
      </div>
    );
  }
  const qr = await QRCode.toDataURL(order.qr_token, { margin: 1, width: 240, errorCorrectionLevel: "M" });

  return (
    <div className="print-root min-h-dvh px-3 py-6">
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-3">
        <Button asChild variant="outline">
          <Link href={`/buyurtmalar/${order.id}`}>
            <ArrowLeft aria-hidden />
            {uz.sheet.backToOrder}
          </Link>
        </Button>
        <PrintButton />
      </div>
      <OrderSheet order={order} qrDataUrl={qr} />
      <AutoPrint enabled={autoprint === "1"} />
    </div>
  );
}
