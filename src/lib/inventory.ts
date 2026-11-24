import type { Medicine } from "@/types/medicine"
import { calculateSupply } from "@/lib/supply"

export const LOW_STOCK_THRESHOLD = 5

export function isOutOfStock(medicine: Medicine): boolean {
  return medicine.stock <= 0
}

/** Legacy "Low stock" label: stock > 0 and <= 5 doses. */
export function isLowStock(medicine: Medicine): boolean {
  return medicine.stock > 0 && medicine.stock <= LOW_STOCK_THRESHOLD
}

/**
 * The restock banner includes out-of-stock, sub-day/critical/low supply, and
 * the legacy threshold, so the badge stays the primary urgency signal.
 */
export function needsRestock(medicine: Medicine, now: Date = new Date()): boolean {
  const supply = calculateSupply(
    medicine.stock,
    medicine.frequencyPerDay,
    now,
  )
  return (
    supply.level === "out" ||
    supply.level === "critical" ||
    supply.level === "low" ||
    isLowStock(medicine)
  )
}
