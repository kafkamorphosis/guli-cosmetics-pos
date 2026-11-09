"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Check, Loader2, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { Krw } from "@/components/money";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { resolveScope, ScopeSelect } from "@/features/analytics/scope-select";
import { getCustomerStats, renameCustomer } from "@/lib/data/customers";
import { listOrders, type OrderListRow } from "@/lib/data/orders";
import type { CustomerRow } from "@/lib/domain/customers";
import { formatDateTime } from "@/lib/domain/dates";
import { errorMessage } from "@/lib/domain/errors";
import { formatOrderNo } from "@/lib/domain/order-no";
import { formatOrderTotal } from "@/lib/domain/order-total";
import { formatPhone } from "@/lib/domain/phone";
import { orderTypeLabel } from "@/lib/i18n/labels";
import { supabaseBrowser } from "@/lib/supabase/client";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";
import { Spent } from "./spent";

const HISTORY_SIZE = 200;

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("cell", className)}>
      <span className="caption">{label}</span>
      <div className="mt-0.5 font-semibold">{children}</div>
    </div>
  );
}

function NameEditor({ customer, onSaved }: { customer: CustomerRow; onSaved(name: string | null): void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(customer.name ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await renameCustomer(supabaseBrowser(), customer.id, value);
      onSaved(value.trim() || null);
      setEditing(false);
      toast.success(uz.customers.renamed);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <h1 className="text-3xl font-bold tracking-tight">{customer.name || <span className="text-ink-3">{uz.customers.noName}</span>}</h1>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            setValue(customer.name ?? "");
            setEditing(true);
          }}
          aria-label={uz.customers.rename}
        >
          <Pencil aria-hidden />
        </Button>
      </div>
    );
  }
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label className="sr-only" htmlFor="customer-name">
        {uz.customers.name}
      </label>
      <Input
        id="customer-name"
        autoFocus
        value={value}
        maxLength={120}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
        className="h-11 w-72 text-lg font-semibold"
      />
      <Button type="submit" disabled={saving}>
        {saving ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
        {uz.common.save}
      </Button>
      <Button type="button" variant="ghost" size="icon" onClick={() => setEditing(false)} aria-label={uz.common.cancel}>
        <X aria-hidden />
      </Button>
    </form>
  );
}

export function CustomerDetail({ id, isManager, meId }: { id: string; isManager: boolean; meId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const { scope, sellerId } = resolveScope(isManager, meId, sp.get("s"));
  const key = String(sellerId);
  const [data, setData] = useState<{ key: string; customer: CustomerRow | null; orders: OrderListRow[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const sb = supabaseBrowser();
    Promise.all([
      getCustomerStats(sb, id, sellerId),
      listOrders(sb, { customerId: id, sellerId: sellerId ?? undefined }, HISTORY_SIZE),
    ])
      .then(([customer, orders]) => !cancelled && setData({ key, customer, orders: orders.rows }))
      .catch((e) => !cancelled && toast.error(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [id, key, sellerId]);

  const current = data?.key === key ? data : null;
  const customer = current?.customer;
  const backHref = `/mijozlar${isManager && scope ? `?s=${encodeURIComponent(scope)}` : ""}`;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href={backHref}>
            <ArrowLeft aria-hidden />
            {uz.customers.back}
          </Link>
        </Button>
        <ScopeSelect
          isManager={isManager}
          meId={meId}
          value={scope}
          onChange={(v) => router.replace(v ? `${pathname}?s=${encodeURIComponent(v)}` : pathname, { scroll: false })}
        />
      </div>

      {current === null ? (
        <Skeleton className="h-80 rounded-lg border border-ink" />
      ) : !customer ? (
        <div className="waybill px-4 py-12 text-center text-ink-2">{uz.customers.notFound}</div>
      ) : (
        <div className="waybill">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-ink px-4 py-3">
            <div>
              <NameEditor
                key={customer.id}
                customer={customer}
                onSaved={(name) => setData((d) => d && d.customer && { ...d, customer: { ...d.customer, name } })}
              />
              <a href={`tel:${customer.phone}`} className="num text-lg text-ink-2 hover:underline">
                {formatPhone(customer.phone)}
              </a>
            </div>
            <Spent c={customer} className="monument text-3xl" />
          </div>

          <div className="grid grid-cols-2 border-b border-ink md:grid-cols-5 [&>*]:border-rule-soft [&>*:not(:last-child)]:border-r max-md:[&>*:nth-child(2)]:border-r-0 max-md:[&>*:nth-child(-n+4)]:border-b">
            <Field label={uz.customers.orders}>
              <span className="num">{customer.orders}</span>
            </Field>
            <Field label={uz.customers.tekpe}>
              <span className="num">{customer.tekpe_orders}</span>
            </Field>
            <Field label={uz.customers.items}>
              <span className="num">{customer.items}</span>
            </Field>
            <Field label={uz.customers.avgOrder}>
              {customer.orders > 0 ? <Krw value={Math.round(customer.spent / customer.orders)} /> : "—"}
            </Field>
            <Field label={uz.customers.lastOrder} className="max-md:col-span-2">
              <span className="num">{customer.last_order_at ? formatDateTime(customer.last_order_at) : "—"}</span>
            </Field>
          </div>

          <h2 className="caption border-b border-ink bg-paper px-3 py-2">{uz.customers.history}</h2>
          {current.orders.length === 0 ? (
            <p className="px-4 py-10 text-center text-ink-2">{uz.customers.noHistory}</p>
          ) : (
            <ul>
              {current.orders.map((o) => (
                <li key={o.id} className="border-b border-rule-soft last:border-0">
                  <Link
                    href={`/buyurtmalar/${o.id}`}
                    className="grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-1 px-3 py-2.5 hover:bg-paper active:bg-paper"
                  >
                    <span className="monument text-lg">{formatOrderNo(o.order_no)}</span>
                    <span className="min-w-0 text-sm">
                      <span className="num block text-ink-2">{formatDateTime(o.created_at)}</span>
                      <span className="block truncate text-xs text-ink-3">
                        {orderTypeLabel(o)} · {uz.payment[o.payment_method]}
                        {o.seller?.full_name ? ` · ${o.seller.full_name}` : ""}
                      </span>
                    </span>
                    <span className="flex flex-col items-end gap-1">
                      <span className={cn("num font-bold whitespace-nowrap", o.status === "cancelled" && "text-ink-3 line-through")}>
                        {formatOrderTotal(o)}
                      </span>
                      <StatusBadge status={o.status} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
