"use client";

import { useState, useTransition } from "react";
import { Loader2, Search, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { uz } from "@/lib/i18n/uz";
import { findTelegramChats, saveTelegram, sendTelegramTest, type TelegramChat, type TelegramSettings } from "./telegram-actions";

export function TelegramForm({ initial }: { initial: TelegramSettings }) {
  const [token, setToken] = useState("");
  const [chatId, setChatId] = useState(initial.chatId ?? "");
  const [enabled, setEnabled] = useState(initial.enabled);
  const [chats, setChats] = useState<TelegramChat[] | null>(null);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<"find" | "test" | null>(null);

  function save(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await saveTelegram({ token, chatId, enabled });
      if (!r.ok) return void toast.error(r.error);
      setToken("");
      toast.success(uz.admin.saved);
    });
  }

  async function find() {
    setBusy("find");
    const r = await findTelegramChats(token);
    setBusy(null);
    if (!r.ok) return void toast.error(r.error);
    setChats(r.chats);
    if (r.chats.length === 1) setChatId(r.chats[0].id);
    if (r.chats.length === 0) toast.warning(uz.admin.telegramNoChats);
  }

  async function test() {
    setBusy("test");
    const r = await sendTelegramTest({ token, chatId });
    setBusy(null);
    if (r.ok) toast.success(uz.admin.telegramTestSent);
    else toast.error(r.error);
  }

  return (
    <form onSubmit={save} className="waybill mt-6 max-w-xl">
      <div className="border-b border-ink px-3 py-3">
        <h2 className="text-base font-bold">{uz.admin.telegramTitle}</h2>
        <p className="mt-1 text-sm text-ink-2">{uz.admin.telegramIntro}</p>
        <ol className="mt-2 grid list-decimal gap-1 pl-5 text-sm text-ink-2">
          <li>{uz.admin.telegramStep1}</li>
          <li>{uz.admin.telegramStep2}</li>
          <li>{uz.admin.telegramStep3}</li>
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

      <div className="cell border-b border-ink">
        <span className="caption">{uz.admin.telegramChat}</span>
        <div className="mt-1 flex gap-2">
          {chats && chats.length > 0 ? (
            <select
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              aria-label={uz.admin.telegramChat}
              className="h-10 min-w-0 flex-1 rounded-sm border border-input bg-cell px-2 text-sm font-medium"
            >
              <option value="">{uz.admin.telegramChatNone}</option>
              {chats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} ({c.id})
                </option>
              ))}
            </select>
          ) : (
            <Input value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder={uz.admin.telegramChatNone} className="num min-w-0 flex-1" />
          )}
          <Button type="button" variant="outline" onClick={find} disabled={busy !== null}>
            {busy === "find" ? <Loader2 className="animate-spin" aria-hidden /> : <Search aria-hidden />}
            {uz.admin.telegramFindChats}
          </Button>
        </div>
      </div>

      <label className="cell flex items-center justify-between gap-3 border-b border-ink">
        <span className="text-sm font-semibold">{uz.admin.telegramEnabled}</span>
        <Switch checked={enabled} onCheckedChange={setEnabled} aria-label={uz.admin.telegramEnabled} />
      </label>

      <div className="cell flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={test} disabled={busy !== null || pending}>
          {busy === "test" ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
          {uz.admin.telegramTest}
        </Button>
        <Button type="submit" disabled={pending}>
          {uz.common.save}
        </Button>
      </div>
    </form>
  );
}
