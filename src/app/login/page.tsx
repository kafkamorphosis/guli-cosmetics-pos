import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { homeFor } from "@/lib/auth/home";
import { getSessionProfile } from "@/lib/auth/session";
import { uz } from "@/lib/i18n/uz";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: uz.login.title };

export default async function LoginPage() {
  const profile = await getSessionProfile();
  if (profile) redirect(homeFor(profile.role));

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="waybill w-full max-w-sm">
        <div className="flex items-center gap-3 border-b border-ink px-4 py-4">
          <Image src="/brand/guli-mark.png" alt="" width={40} height={40} priority />
          <div className="leading-tight">
            <p className="text-lg font-bold tracking-tight">{uz.brand}</p>
            <h1 className="text-sm text-ink-2">{uz.login.title}</h1>
          </div>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
