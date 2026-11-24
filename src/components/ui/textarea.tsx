import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-24 w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground transition-colors outline-none",
        "placeholder:text-muted-foreground/80",
        "focus-visible:border-sage focus-visible:ring-2 focus-visible:ring-ring/30",
        "aria-invalid:border-brick aria-invalid:ring-2 aria-invalid:ring-brick/15",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
