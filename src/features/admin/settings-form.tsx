"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { uz } from "@/lib/i18n/uz";
import { updateSettings } from "./actions";

export function SettingsForm({ krShippingKrw, uzShippingUsdPerKg }: { krShippingKrw: number; uzShippingUsdPerKg: number }) {
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    start(async () => {
      const r = await updateSettings({ krShippingKrw: Number(f.get("kr")), uzShippingUsdPerKg: Number(f.get("uz")) });
      if (r.ok) toast.success(uz.admin.saved);
      else toast.error(r.error);
    });
  }

  return (
    <form onSubmit={onSubmit} className="waybill max-w-xl">
      <div className="grid sm:grid-cols-2">
        <label className="cell border-b border-ink sm:border-r">
          <span className="caption">{uz.admin.krShipping}</span>
          <Input name="kr" type="number" inputMode="numeric" min={0} step={100} defaultValue={krShippingKrw} required className="num mt-1 text-lg" />
        </label>
        <label className="cell border-b border-ink">
          <span className="caption">{uz.admin.uzShipping}</span>
          <Input name="uz" type="number" inputMode="decimal" min={0} step={0.5} defaultValue={uzShippingUsdPerKg} required className="num mt-1 text-lg" />
        </label>
      </div>
      <div className="cell flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-2">{uz.admin.settingsHint}</p>
        <Button type="submit" disabled={pending}>
          {uz.common.save}
        </Button>
      </div>
    </form>
  );
}
