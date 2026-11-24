import { HeartHandshake, ShieldCheck } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Role is a permissions fact, not an urgency signal — so it never uses amber
 * or brick. Owner reads as stewardship, caregiver as partnership.
 */
export function RoleBadge({
  role,
  className,
}: {
  role: "owner" | "caregiver"
  className?: string
}) {
  const isOwner = role === "owner"
  const Icon = isOwner ? ShieldCheck : HeartHandshake

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
        isOwner
          ? "border-sage/30 bg-sage-soft text-sage-ink"
          : "border-border bg-card text-muted-foreground",
        className
      )}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {isOwner ? "Owner" : "Caregiver"}
    </span>
  )
}
