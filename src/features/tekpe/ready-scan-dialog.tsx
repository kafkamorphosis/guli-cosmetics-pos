"use client";

import { useState } from "react";
import { Camera, CheckCircle2, Loader2, QrCode, TriangleAlert } from "lucide-react";
import { CameraScanner } from "@/components/scanner/camera-scanner";
import { scanFeedback } from "@/components/scanner/feedback";
import { useHidScanner } from "@/components/scanner/use-hid-scanner";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { OrderListRow } from "@/lib/data/orders";
import { formatKg } from "@/lib/domain/money";
import { errorMessage } from "@/lib/domain/errors";
import { formatOrderNo } from "@/lib/domain/order-no";
import { formatOrderTotal } from "@/lib/domain/order-total";
import { formatPhone } from "@/lib/domain/phone";
import { orderTypeLabel } from "@/lib/i18n/labels";
import { supabaseBrowser } from "@/lib/supabase/client";
import { uz } from "@/lib/i18n/uz";

type Scan = { kind: "order"; order: OrderListRow } | { kind: "message"; text: string } | null;

async function findByToken(token: string): Promise<OrderListRow | null> {
  const { data, error } = await supabaseBrowser()
    .from("orders")
    .select("*, customer:customers(name, phone), seller:profiles!orders_seller_id_fkey(full_name)")
    .eq("qr_token", token)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as OrderListRow | null;
}

export function ReadyScanDialog({ open, onOpenChange, onChanged }: { open: boolean; onOpenChange(o: boolean): void; onChanged(): void }) {
  const [scan, setScan] = useState<Scan>(null);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState<OrderListRow[]>([]);
  const [camera, setCamera] = useState(false);

  async function onToken(raw: string) {
    const token = raw.trim().toUpperCase();
    if (!token || busy) return;
    setBusy(true);
    try {
      const order = await findByToken(token);
      if (!order) {
        scanFeedback(false);
        setScan({ kind: "message", text: uz.tekpe.unknownCode });
      } else {
        scanFeedback(order.type === "tekpe" && (order.status === "new" || order.status === "ready"));
        setScan({ kind: "order", order });
      }
    } catch (e) {
      scanFeedback(false);
      setScan({ kind: "message", text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  async function move(order: OrderListRow, status: "ready" | "picked_up") {
    setBusy(true);
    const { data, error } = await supabaseBrowser().rpc("set_order_status", { p_order_id: order.id, p_status: status });
    setBusy(false);
    if (error) {
      setScan({ kind: "message", text: errorMessage(error) });
      return;
    }
    const updated = { ...order, ...data };
    setConfirmed((list) => [updated, ...list.filter((o) => o.id !== order.id)]);
    setScan(null);
    onChanged();
  }

  useHidScanner(onToken, { enabled: open && !camera });

  const order = scan?.kind === "order" ? scan.order : null;
  const canReady = order?.type === "tekpe" && order.status === "new";
  const canPick = order?.type === "tekpe" && order.status === "ready";
  const problem =
    order && !canReady && !canPick
      ? order.type !== "tekpe"
        ? uz.tekpe.notTekpe
        : uz.tekpe.finalStatus(uz.status[order.status])
      : null;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          onOpenChange(o);
          if (!o) {
            setScan(null);
            setConfirmed([]);
          }
        }}
      >
        <DialogContent
          className="gap-0 overflow-hidden border border-ink p-0 max-sm:max-h-dvh max-sm:overflow-y-auto sm:max-w-lg"
          onKeyDown={(e) => {
            if (e.key === "Enter" && order && (canReady || canPick) && !busy) {
              e.preventDefault();
              move(order, canReady ? "ready" : "picked_up");
            }
          }}
        >
          <DialogHeader className="border-b border-ink px-4 py-3">
            <DialogTitle className="text-lg">{uz.tekpe.scanTitle}</DialogTitle>
            <DialogDescription className="sr-only">{uz.tekpe.scanHint}</DialogDescription>
          </DialogHeader>

          {!scan && (
            <div className="flex flex-col items-center gap-3 border-b border-ink px-4 py-10 text-center">
              {busy ? <Loader2 className="size-10 animate-spin text-ink-3" aria-hidden /> : <QrCode className="size-12 text-ink-3" strokeWidth={1.25} aria-hidden />}
              <p className="text-base font-semibold">{uz.tekpe.scanHint}</p>
              <Button variant="outline" onClick={() => setCamera(true)}>
                <Camera aria-hidden />
                {uz.common.camera}
              </Button>
            </div>
          )}

          {scan?.kind === "message" && (
            <div role="alert" className="flex flex-col items-center gap-3 border-b border-ink bg-danger-soft px-4 py-8 text-center text-danger">
              <TriangleAlert className="size-10" aria-hidden />
              <p className="text-base font-semibold">{scan.text}</p>
              <Button variant="outline" onClick={() => setScan(null)}>
                {uz.common.close}
              </Button>
            </div>
          )}

          {order && (
            <div className="border-b border-ink">
              <div className="flex items-center justify-between gap-3 border-b border-rule-soft px-4 py-3">
                <p className="monument text-[2.75rem] leading-none">{formatOrderNo(order.order_no)}</p>
                <StatusBadge status={order.status} />
              </div>
              <dl className="grid grid-cols-2 text-sm">
                <div className="cell border-r border-b border-rule-soft">
                  <dt className="caption">{uz.orders.customer}</dt>
                  <dd className="font-semibold">{order.customer?.name ?? "—"}</dd>
                  {order.customer && <dd className="num text-ink-2">{formatPhone(order.customer.phone)}</dd>}
                </div>
                <div className="cell border-b border-rule-soft">
                  <dt className="caption">{uz.orders.type}</dt>
                  <dd className="font-semibold">{orderTypeLabel(order)}</dd>
                </div>
                <div className="cell border-r border-rule-soft">
                  <dt className="caption">{uz.tekpe.items}</dt>
                  <dd className="num font-semibold">
                    {order.item_count} · {formatKg(order.total_weight_g)}
                  </dd>
                </div>
                <div className="cell">
                  <dt className="caption">{uz.orders.total}</dt>
                  <dd className="num font-semibold">{formatOrderTotal(order)}</dd>
                </div>
              </dl>
              {order.status === "ready" && canPick && (
                <p className="border-t border-rule-soft bg-warn-soft px-4 py-2 text-sm font-semibold text-warn">{uz.tekpe.alreadyReady}</p>
              )}
              {problem && <p className="border-t border-rule-soft bg-danger-soft px-4 py-2 text-sm font-semibold text-danger">{problem}</p>}
              <div className="dialog-actions">
                <Button variant="outline" onClick={() => setScan(null)}>
                  {uz.common.close}
                </Button>
                {canReady && (
                  <Button size="lg" onClick={() => move(order, "ready")} disabled={busy}>
                    {busy && <Loader2 className="animate-spin" aria-hidden />}
                    {uz.common.confirm}
                  </Button>
                )}
                {canPick && (
                  <Button size="lg" variant="ink" onClick={() => move(order, "picked_up")} disabled={busy}>
                    {busy && <Loader2 className="animate-spin" aria-hidden />}
                    {uz.tekpe.markPicked}
                  </Button>
                )}
              </div>
            </div>
          )}

          {confirmed.length > 0 && (
            <section className="px-4 py-3">
              <h3 className="caption mb-2">{uz.tekpe.confirmed}</h3>
              <ul className="grid gap-1.5">
                {confirmed.map((o) => (
                  <li key={o.id} className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="size-4 text-ok" aria-hidden />
                    <span className="monument text-base">{formatOrderNo(o.order_no)}</span>
                    <span className="truncate text-ink-2">{o.customer?.name}</span>
                    <StatusBadge status={o.status} className="ml-auto" />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </DialogContent>
      </Dialog>
      <CameraScanner open={camera} onClose={() => setCamera(false)} onScan={onToken} title={uz.tekpe.scanTitle} />
    </>
  );
}
