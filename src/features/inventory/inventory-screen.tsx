"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Archive, MoreHorizontal, Pencil, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { useHidScanner } from "@/components/scanner/use-hid-scanner";
import { Krw, Weight } from "@/components/money";
import { ProductThumb } from "@/components/product-thumb";
import { PageHeader } from "@/components/shell/page-header";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { Product } from "@/lib/database.types";
import { getInventorySummary, isLowStock, listProducts, type InventorySummary } from "@/lib/data/products";
import { errorMessage } from "@/lib/domain/errors";
import { supabaseBrowser } from "@/lib/supabase/client";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";
import { AddProductFlow, lookupStep, type AddStep } from "./add-product-flow";
import { ProductForm } from "./product-form";
import { StockReadout } from "./stock-stepper";

type Sort = "name" | "stock";

function SummaryStrip({ summary }: { summary: InventorySummary | null }) {
  const cells: [string, number | undefined][] = [
    [uz.inventory.costValue, summary?.costValue],
    [uz.inventory.wholesaleValue, summary?.wholesaleValue],
    [uz.inventory.retailValue, summary?.retailValue],
  ];
  return (
    <div className="waybill mb-4 grid sm:grid-cols-3">
      {cells.map(([label, value], i) => (
        <div key={label} className={cn("cell", i > 0 && "border-t border-ink sm:border-t-0 sm:border-l")}>
          <span className="caption">{label}</span>
          {value === undefined ? (
            <Skeleton className="mt-2 h-9 w-40" />
          ) : (
            <Krw value={value} className="monument mt-1 block text-figure" />
          )}
        </div>
      ))}
    </div>
  );
}

function RowMenu({ onEdit, onArchive }: { onEdit(): void; onArchive(): void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={uz.common.edit}>
          <MoreHorizontal aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onEdit}>
          <Pencil aria-hidden />
          {uz.inventory.editTitle}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onArchive} className="text-danger">
          <Archive aria-hidden />
          {uz.inventory.archive}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function InventoryScreen() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [sort, setSort] = useState<Sort>("name");
  const [flow, setFlow] = useState<{ n: number; step: AddStep } | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [archiving, setArchiving] = useState<Product | null>(null);

  const refresh = useCallback(async () => {
    const sb = supabaseBrowser();
    try {
      const [list, sum] = await Promise.all([listProducts(sb), getInventorySummary(sb)]);
      setProducts(list);
      setSummary(sum);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sb = supabaseBrowser();
      try {
        const [list, sum] = await Promise.all([listProducts(sb), getInventorySummary(sb)]);
        if (cancelled) return;
        setProducts(list);
        setSummary(sum);
      } catch (e) {
        if (!cancelled) toast.error(errorMessage(e));
      }
    })();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabaseBrowser()
      .channel("inventory-products")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => {
        clearTimeout(timer);
        timer = setTimeout(refresh, 300);
      })
      // Realtime doesn't replay what was missed while offline or asleep: reload on (re)connect and focus.
      .subscribe((status) => {
        if (status === "SUBSCRIBED") refresh();
      });
    const onFocus = () => document.visibilityState === "visible" && refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      supabaseBrowser().removeChannel(channel);
    };
  }, [refresh]);

  const visible = useMemo(() => {
    if (!products) return null;
    const q = query.trim().toLowerCase();
    const filtered = q ? products.filter((p) => p.name.toLowerCase().includes(q) || p.barcode.toLowerCase().includes(q)) : products;
    return [...filtered].sort((a, b) => (sort === "stock" ? a.stock - b.stock : a.name.localeCompare(b.name, "uz")));
  }, [products, query, sort]);

  // Kassa's "Omborga qoʻshish" shortcut arrives with ?barcode=…: open the add flow for it once.
  const router = useRouter();
  const pathname = usePathname();
  const pendingBarcode = searchParams.get("barcode");
  useEffect(() => {
    if (!pendingBarcode) return;
    router.replace(pathname);
    lookupStep(pendingBarcode)
      .then((step) => setFlow({ n: Date.now(), step }))
      .catch((e) => toast.error(errorMessage(e)));
  }, [pendingBarcode, pathname, router]);

  // A scan on the page opens the add flow at the right step instead of typing into the search box.
  useHidScanner(
    (code) => {
      lookupStep(code)
        .then((step) => setFlow({ n: Date.now(), step }))
        .catch((e) => toast.error(errorMessage(e)));
    },
    { enabled: flow === null && editing === null && archiving === null },
  );

  async function archive(p: Product) {
    const { error } = await supabaseBrowser().from("products").update({ is_archived: true }).eq("id", p.id);
    if (error) return toast.error(errorMessage(error));
    toast.success(uz.inventory.archived);
    refresh();
  }

  return (
    <>
      <PageHeader title={uz.inventory.title}>
        <Button onClick={() => setFlow({ n: Date.now(), step: { kind: "scan" } })} size="lg">
          <Plus aria-hidden />
          {uz.inventory.add}
        </Button>
      </PageHeader>

      <SummaryStrip summary={summary} />

      <div className="waybill">
        <div className="flex flex-wrap items-center gap-2 border-b border-ink p-2">
          <label className="relative w-full min-w-0 sm:w-auto sm:flex-1">
            <span className="sr-only">{uz.common.search}</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={uz.inventory.searchPlaceholder}
              className="pl-9"
            />
          </label>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            aria-label={uz.inventory.sort}
            className="h-10 rounded-sm border border-input bg-cell px-2 text-sm font-medium"
          >
            <option value="name">{uz.inventory.sortName}</option>
            <option value="stock">{uz.inventory.sortStock}</option>
          </select>
          {products && <span className="num px-2 text-sm text-ink-2">{uz.inventory.count(visible?.length ?? 0)}</span>}
        </div>

        {visible === null ? (
          <div className="grid gap-px">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-16 rounded-none" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <p className="px-4 py-12 text-center text-base text-ink-2">{products?.length ? uz.inventory.noMatch : uz.inventory.empty}</p>
        ) : (
          <>
            {/* Desktop: ruled table */}
            <table className="hidden w-full text-sm lg:table">
              <thead className="border-b border-ink bg-paper text-left">
                <tr>
                  <th className="w-14 px-3 py-2"><span className="sr-only">{uz.inventory.photo}</span></th>
                  <th className="caption px-3 py-2">{uz.inventory.name}</th>
                  <th className="caption px-3 py-2 text-right">{uz.inventory.cost}</th>
                  <th className="caption px-3 py-2 text-right">{uz.inventory.wholesale}</th>
                  <th className="caption px-3 py-2 text-right">{uz.inventory.retail}</th>
                  <th className="caption px-3 py-2 text-right">{uz.inventory.weightShort}</th>
                  <th className="caption w-52 px-3 py-2">{uz.inventory.stock}</th>
                  <th className="w-12 px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => {
                  const low = isLowStock(p);
                  return (
                    <tr key={p.id} className={cn("border-b border-rule-soft last:border-0", low && "bg-warn-soft/60")}>
                      <td className="px-3 py-2"><ProductThumb path={p.photo_path} /></td>
                      <td className="px-3 py-2">
                        <p className="font-semibold">{p.name}</p>
                        <p className="num text-xs tracking-wider text-ink-3">
                          {p.barcode}
                          {low && <span className="ml-2 font-sans font-semibold tracking-normal text-warn">{uz.inventory.low}</span>}
                        </p>
                      </td>
                      <td className="px-3 py-2 text-right text-ink-2"><Krw value={p.cost_price} /></td>
                      <td className="px-3 py-2 text-right font-semibold"><Krw value={p.wholesale_price} /></td>
                      <td className="px-3 py-2 text-right font-semibold"><Krw value={p.retail_price} /></td>
                      <td className="px-3 py-2 text-right text-ink-2"><Weight grams={p.weight_g} /></td>
                      <td className="px-3 py-2">
                        <StockReadout stock={p.stock} threshold={p.low_stock_threshold} />
                      </td>
                      <td className="px-2 py-2">
                        <RowMenu onEdit={() => setEditing(p)} onArchive={() => setArchiving(p)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Phone/tablet: ruled cards */}
            <ul className="lg:hidden">
              {visible.map((p) => {
                const low = isLowStock(p);
                return (
                  <li key={p.id} className={cn("grid gap-3 border-b border-rule-soft p-3 last:border-0", low && "bg-warn-soft/60")}>
                    <div className="flex items-start gap-3">
                      <ProductThumb path={p.photo_path} size={48} />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{p.name}</p>
                        <p className="num text-xs tracking-wider text-ink-3">
                          {p.barcode}
                          {low && <span className="ml-2 font-sans font-semibold tracking-normal text-warn">{uz.inventory.low}</span>}
                        </p>
                      </div>
                      <RowMenu onEdit={() => setEditing(p)} onArchive={() => setArchiving(p)} />
                    </div>
                    <dl className="grid grid-cols-3 rounded-sm border border-rule-soft text-sm">
                      <div className="px-2 py-1.5">
                        <dt className="caption">{uz.inventory.cost}</dt>
                        <dd className="text-ink-2"><Krw value={p.cost_price} /></dd>
                      </div>
                      <div className="border-l border-rule-soft px-2 py-1.5">
                        <dt className="caption">{uz.inventory.wholesale}</dt>
                        <dd className="font-semibold"><Krw value={p.wholesale_price} /></dd>
                      </div>
                      <div className="border-l border-rule-soft px-2 py-1.5">
                        <dt className="caption">{uz.inventory.retail}</dt>
                        <dd className="font-semibold"><Krw value={p.retail_price} /></dd>
                      </div>
                    </dl>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-ink-2"><Weight grams={p.weight_g} /></span>
                      <StockReadout stock={p.stock} threshold={p.low_stock_threshold} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      {flow && (
        <AddProductFlow key={flow.n} open initialStep={flow.step} onOpenChange={(o) => !o && setFlow(null)} onSaved={refresh} />
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="gap-0 overflow-hidden border border-ink p-0 max-sm:max-h-dvh max-sm:overflow-y-auto sm:max-w-xl">
          <DialogHeader className="border-b border-ink px-4 py-3">
            <DialogTitle className="text-lg">{uz.inventory.editTitle}</DialogTitle>
          </DialogHeader>
          {editing && (
            <ProductForm
              barcode={editing.barcode}
              product={editing}
              onSaved={() => {
                setEditing(null);
                refresh();
              }}
              onCancel={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={archiving !== null} onOpenChange={(o) => !o && setArchiving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{archiving?.name}</AlertDialogTitle>
            <AlertDialogDescription>{uz.inventory.archiveConfirm}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{uz.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (archiving) archive(archiving);
                setArchiving(null);
              }}
            >
              {uz.inventory.archive}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
