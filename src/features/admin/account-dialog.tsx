"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { uz } from "@/lib/i18n/uz";
import type { Role } from "@/lib/auth/home";
import { createAccount, resetPassword } from "./actions";

export function RoleSelect({
  value,
  onChange,
  disabled,
  label,
}: {
  value: Role;
  onChange?: (r: Role) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      aria-label={label}
      onChange={(e) => onChange?.(e.target.value as Role)}
      className="h-10 w-full rounded-sm border border-input bg-cell px-2 text-sm font-medium focus-visible:border-ink disabled:opacity-60"
    >
      <option value="seller">{uz.roles.seller}</option>
      <option value="manager">{uz.roles.manager}</option>
      <option value="admin">{uz.roles.admin}</option>
    </select>
  );
}

export function NewAccountDialog({ open, onOpenChange }: { open: boolean; onOpenChange(o: boolean): void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<Role>("seller");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    start(async () => {
      const r = await createAccount({
        username: String(f.get("username") ?? ""),
        fullName: String(f.get("fullName") ?? ""),
        password: String(f.get("password") ?? ""),
        role,
      });
      if (!r.ok) return setError(r.error);
      toast.success(uz.admin.created_ok);
      setError(null);
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{uz.admin.newAccount}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-3">
          <label className="grid gap-1">
            <span className="caption">{uz.admin.username}</span>
            <Input name="username" autoCapitalize="none" spellCheck={false} required autoComplete="off" />
          </label>
          <label className="grid gap-1">
            <span className="caption">{uz.admin.fullName}</span>
            <Input name="fullName" required autoComplete="off" />
          </label>
          <label className="grid gap-1">
            <span className="caption">{uz.admin.password}</span>
            <Input name="password" type="password" required minLength={8} autoComplete="new-password" />
          </label>
          <div className="grid gap-1">
            <span className="caption">{uz.admin.role}</span>
            <RoleSelect value={role} onChange={setRole} label={uz.admin.role} />
          </div>
          {error && (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {uz.common.cancel}
            </Button>
            <Button type="submit" disabled={pending}>
              {uz.common.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ResetPasswordDialog({
  userId,
  username,
  onClose,
}: {
  userId: string | null;
  username: string;
  onClose(): void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!userId) return;
    const password = String(new FormData(e.currentTarget).get("password") ?? "");
    start(async () => {
      const r = await resetPassword(userId, password);
      if (!r.ok) return setError(r.error);
      toast.success(uz.admin.passwordChanged);
      setError(null);
      onClose();
    });
  }

  return (
    <Dialog open={userId !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {uz.admin.resetPassword}: {username}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-3">
          <label className="grid gap-1">
            <span className="caption">{uz.admin.newPassword}</span>
            <Input name="password" type="password" required minLength={8} autoComplete="new-password" autoFocus />
          </label>
          {error && (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {uz.common.cancel}
            </Button>
            <Button type="submit" disabled={pending}>
              {uz.common.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
