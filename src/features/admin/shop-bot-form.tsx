"use client";

import { useState, useTransition } from "react";
import { Loader2, PlugZap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { uz } from "@/lib/i18n/uz";
import { connectShopBot, type ShopBotSettings } from "./shop-bot-actions";

export function ShopBotForm({ initial }: { initial: ShopBotSettings }) {
  const [token, setToken] = useState("");
  const [pending, start] = useTransition();

  function connect(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await connectShopBot({ token });
      if (!r.ok) return void toast.error(r.error);
      setToken("");
      toast.success(uz.shop.adminConnected);
    });
  }

  return (
    <form onSubmit={connect} className="waybill mt-6 max-w-xl">
      <div className="border-b border-ink px-3 py-3">
        <h2 className="text-base font-bold">{uz.shop.adminTitle}</h2>
        <p className="mt-1 text-sm text-ink-2">{uz.shop.adminIntro}</p>
        <ol className="mt-2 grid list-decimal gap-1 pl-5 text-sm text-ink-2">
          <li>{uz.shop.adminStep1}</li>
          <li>{uz.shop.adminStep2}</li>
          <li>{uz.shop.adminStep3}</li>
        </ol>
      </div>

      <label className="cell block border-b border-ink">
        <span className="caption">{uz.admin.telegramToken}</span>
        <Input
          value={token}
          onChange={(e) => setToken(e.target.value)}
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={initial.tokenHint ?? "123456789:ABC…"}
          className="num mt-1"
        />
        {initial.tokenHint && <span className="mt-1 block text-xs text-ink-3">{uz.admin.telegramTokenSaved(initial.tokenHint)}</span>}
      </label>

      {initial.botUsername && (
        <p className="cell border-b border-ink text-sm">
          {uz.shop.adminLive}{" "}
          <a href={`https://t.me/${initial.botUsername}`} target="_blank" rel="noreferrer" className="font-semibold underline">
            @{initial.botUsername}
          </a>
        </p>
      )}

      <div className="cell flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <PlugZap aria-hidden />}
          {uz.shop.adminConnect}
        </Button>
      </div>
    </form>
  );
}
