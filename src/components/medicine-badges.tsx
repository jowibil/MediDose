import { Package, TriangleAlert } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import type { Medicine } from "@/types/medicine"
import { EXPIRING_SOON_THRESHOLD_DAYS } from "@/types/medicine"
import { daysUntil, formatDaysRemaining } from "@/lib/dates"
import { calculateSupply, supplyBadgeVariant } from "@/lib/supply"
import { cn } from "@/lib/utils"

export function SupplyBadge({
  medicine,
  now,
  compact = true,
}: {
  medicine: Medicine
  now: Date
  compact?: boolean
}) {
  const supply = calculateSupply(medicine.stock, medicine.frequencyPerDay, now)
  return (
    <Badge
      variant={supplyBadgeVariant(supply.level)}
      title={supply.label}
      data-supply-level={supply.level}
    >
      <Package aria-hidden="true" className="size-3.5" />
      {compact ? supply.shortLabel : supply.label}
    </Badge>
  )
}

/**
 * A scannable supply line: doses on hand, days left, and the restock-by day.
 * Only calls calculateSupply(); it never derives thresholds itself.
 */
export function SupplyMeter({
  medicine,
  now,
  className,
}: {
  medicine: Medicine
  now: Date
  className?: string
}) {
  const supply = calculateSupply(medicine.stock, medicine.frequencyPerDay, now)
  const isHealthy = supply.level === "healthy" || supply.level === "unknown"

  // The bar is a visual scale only; the label carries the real meaning.
  const percent =
    supply.daysRemaining === null
      ? 0
      : Math.min(100, Math.max(6, (supply.daysRemaining / 30) * 100))

  const barTone =
    supply.level === "out" || supply.level === "critical"
      ? "bg-brick"
      : supply.level === "low"
        ? "bg-amber"
        : "bg-sage"

  const textTone =
    supply.level === "out" || supply.level === "critical"
      ? "text-brick-ink"
      : supply.level === "low"
        ? "text-amber-ink"
        : "text-muted-foreground"

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs">
        <span className="font-medium tabular-nums text-foreground">
          {medicine.stock} dose{medicine.stock === 1 ? "" : "s"} on hand
        </span>
        <span className={cn("tabular-nums", textTone)}>{supply.shortLabel}</span>
      </div>
      <div
        role="img"
        aria-label={supply.label}
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn("h-full rounded-full", barTone)}
          style={{ width: `${percent}%` }}
        />
      </div>
      {!isHealthy && supply.restockByLabel ? (
        <p className={cn("text-[11px]", textTone)}>
          Restock by {supply.restockByLabel}
        </p>
      ) : null}
    </div>
  )
}

export function ExpirationBadge({
  expirationDate,
  todayIso,
}: {
  expirationDate: string
  todayIso: string
}) {
  const days = daysUntil(expirationDate, todayIso)
  const variant =
    days < 0 ? "expired" : days <= EXPIRING_SOON_THRESHOLD_DAYS ? "expiring" : "safe"

  return (
    <Badge variant={variant}>
      {days < 0 ? <TriangleAlert aria-hidden="true" className="size-3.5" /> : null}
      {formatDaysRemaining(expirationDate, todayIso)}
    </Badge>
  )
}
