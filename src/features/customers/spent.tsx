import { Krw, Usd } from "@/components/money";
import type { CustomerRow } from "@/lib/domain/customers";
import { cn } from "@/lib/utils";

// What a client paid: goods + Korean shipping in ₩, Uzbekistan shipping in $ beside it.
export function Spent({ c, className }: { c: Pick<CustomerRow, "spent" | "shipping_usd">; className?: string }) {
  return (
    <span className={cn("num whitespace-nowrap", className)}>
      <Krw value={c.spent} />
      {c.shipping_usd > 0 && (
        <>
          {" + "}
          <Usd value={c.shipping_usd} />
        </>
      )}
    </span>
  );
}
