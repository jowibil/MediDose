import type { LucideIcon } from "lucide-react"

interface EmptySectionProps {
  icon: LucideIcon
  title: string
  description: string
}

/**
 * Placeholder for a section that hasn't been built yet in this pass.
 * Replace with the real feature component (schedule, inventory, alerts).
 */
export function EmptySection({ icon: Icon, title, description }: EmptySectionProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-border/70 py-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <Icon className="size-6" strokeWidth={1.5} />
      </div>
      <div>
        <p className="font-display text-base tracking-tight">{title}</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}