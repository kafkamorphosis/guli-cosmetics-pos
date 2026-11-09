import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { SettingsForm } from "@/features/admin/settings-form";
import { getShopBotSettings } from "@/features/admin/shop-bot-actions";
import { ShopBotForm } from "@/features/admin/shop-bot-form";
import { getTelegramSettings } from "@/features/admin/telegram-actions";
import { TelegramForm } from "@/features/admin/telegram-form";
import { getShippingRates } from "@/lib/data/settings";
import { supabaseServer } from "@/lib/supabase/server";
import { uz } from "@/lib/i18n/uz";

export const metadata: Metadata = { title: uz.admin.settingsTitle };

export default async function SettingsPage() {
  const [rates, telegram, shopBot] = await Promise.all([
    getShippingRates(await supabaseServer()),
    getTelegramSettings(),
    getShopBotSettings(),
  ]);
  return (
    <>
      <PageHeader title={uz.admin.settingsTitle} />
      <SettingsForm {...rates} />
      <TelegramForm initial={telegram} />
      <ShopBotForm initial={shopBot} />
    </>
  );
}
