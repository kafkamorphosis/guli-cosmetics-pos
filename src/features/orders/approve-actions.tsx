"use client";

import { useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/domain/errors";
import { formatOrderNo } from "@/lib/domain/order-no";
import { supabaseBrowser } from "@/lib/supabase/client";
import { uz } from "@/lib/i18n/uz";

// Tasdiqlash takes the stock and moves the order to Yangi; Rad etish cancels it (no stock was taken).
export function ApproveActions({
  order,
  onDone,
  size = "sm",
}: {
  order: { id: string; order_no: number };
  onDone(): void;
  size?: "sm" | "default" | "lg";
}) {
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const no = formatOrderNo(order.order_no);

  async function run(kind: "approve" | "reject") {
    setBusy(kind);
    const sb = supabaseBrowser();
    const { error } =
      kind === "approve" ? await sb.rpc("approve_order", { p_order_id: order.id }) : await sb.rpc("cancel_order", { p_order_id: order.id });
    setBusy(null);
    setConfirming(false);
    if (error) toast.error(errorMessage(error));
    else toast.success(kind === "approve" ? uz.tekpe.approved(no) : uz.tekpe.rejected(no));
    onDone();
  }

  return (
    <>
      <div className="flex gap-1.5">
        <Button size={size} variant="outline" onClick={() => setConfirming(true)} disabled={busy !== null}>
          <X aria-hidden />
          {uz.tekpe.reject}
        </Button>
        <Button size={size} onClick={() => run("approve")} disabled={busy !== null}>
          {busy === "approve" ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
          {uz.tekpe.approve}
        </Button>
      </div>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{uz.tekpe.rejectTitle(no)}</AlertDialogTitle>
            <AlertDialogDescription>{uz.tekpe.rejectHint}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{uz.tekpe.keep}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(e) => {
                e.preventDefault();
                run("reject");
              }}
              disabled={busy !== null}
            >
              {busy === "reject" && <Loader2 className="animate-spin" aria-hidden />}
              {uz.tekpe.reject}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
