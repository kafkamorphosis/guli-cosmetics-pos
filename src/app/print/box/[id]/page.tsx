import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AutoPrint } from "@/features/print/autoprint";
import { BoxSheet } from "@/features/print/box-sheet";
import { PrintButton } from "@/features/print/print-button";
import { requireRole } from "@/lib/auth/session";
import { getBoxForSheet } from "@/lib/data/boxes";
import { formatBoxNo } from "@/lib/domain/order-no";
import { supabaseServer } from "@/lib/supabase/server";
import { uz } from "@/lib/i18n/uz";
import "../../print.css";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: PageProps<"/print/box/[id]">): Promise<Metadata> {
  const { id } = await params;
  const box = UUID_RE.test(id) ? await getBoxForSheet(await supabaseServer(), id).catch(() => null) : null;
  return { title: { absolute: box ? formatBoxNo(box.box_no) : uz.sheet.boxNotFound } };
}

export default async function BoxPrintPage({ params, searchParams }: PageProps<"/print/box/[id]">) {
  await requireRole(["manager"]);
  const { id } = await params;
  const { autoprint } = await searchParams;
  if (!UUID_RE.test(id)) notFound();
  const box = await getBoxForSheet(await supabaseServer(), id).catch(() => null);
  if (!box) notFound();

  return (
    <div className="print-root min-h-dvh px-3 py-6">
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-3">
        <Button asChild variant="outline">
          <Link href="/tekpe?tab=boxes">
            <ArrowLeft aria-hidden />
            {uz.tekpe.boxesTab}
          </Link>
        </Button>
        <PrintButton />
      </div>
      <BoxSheet box={box} />
      <AutoPrint enabled={autoprint === "1"} />
    </div>
  );
}
