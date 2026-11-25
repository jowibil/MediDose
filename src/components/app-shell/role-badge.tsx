import { HeartHandshake, ShieldCheck, UserRound } from "lucide-react"

import { cn } from "@/lib/utils"
import type { HouseholdRole } from "@/types/medicine"

const BADGES = {
  owner: { label: "Owner", Icon: ShieldCheck, tone: "border-sage/30 bg-sage-soft text-sage-ink" },
  caregiver: { label: "Caregiver", Icon: HeartHandshake, tone: "border-border bg-card text-muted-foreground" },
  patient: { label: "Patient", Icon: UserRound, tone: "border-border bg-card text-muted-foreground" },
} as const

/**
 * Role is a permissions fact, not an urgency signal — so it never uses amber
 * or brick. Owner reads as stewardship, caregiver as partnership, patient as
 * the person the record belongs to.
 */
export function RoleBadge({
  role,
  className,
}: {
  role: HouseholdRole
  className?: string
}) {
  const { label, Icon, tone } = BADGES[role]

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
        tone,
        className
      )}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {label}
    </span>
  )
}
