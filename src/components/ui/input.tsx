import * as React from "react"
import { cn } from "cn"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 rounded-sm border border-input bg-cell px-3 py-1 text-base text-ink transition-[border-color,box-shadow] duration-150 outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-ink-3/80 focus-visible:border-ink focus-visible:shadow-[0_0_0_1px_var(--ink)] focus-visible:outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 aria-invalid:border-danger aria-invalid:shadow-[0_0_0_1px_var(--danger)]",
        className
      )}
      {...props}
    />
  )
}

export { Input }
