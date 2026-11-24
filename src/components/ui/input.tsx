import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-11 w-full min-w-0 rounded-xl border border-input bg-card px-3 py-1 text-sm text-foreground transition-colors outline-none md:h-10",
        "placeholder:text-muted-foreground/80",
        "selection:bg-amber-soft selection:text-ink",
        "focus-visible:border-sage focus-visible:ring-2 focus-visible:ring-ring/30",
        "aria-invalid:border-brick aria-invalid:ring-2 aria-invalid:ring-brick/15",
        "disabled:cursor-not-allowed disabled:opacity-50",
        type === "number" || type === "time" || type === "date" || type === "month"
          ? "tabular-nums"
          : "",
        className
      )}
      {...props}
    />
  )
}

export { Input }
