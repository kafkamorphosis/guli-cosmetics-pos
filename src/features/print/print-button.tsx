"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uz } from "@/lib/i18n/uz";

export function PrintButton() {
  return (
    <Button onClick={() => window.print()}>
      <Printer aria-hidden />
      {uz.common.print}
    </Button>
  );
}
