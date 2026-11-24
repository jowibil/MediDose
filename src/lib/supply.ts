import { addLocalDays, formatRestockBy, startOfLocalDay } from "@/lib/dates"

export type SupplyLevel = "out" | "critical" | "low" | "healthy" | "unknown"

export interface SupplyInfo {
  /** floor(stock / frequency); null when the inputs are invalid. */
  daysRemaining: number | null
  level: SupplyLevel
  /** Full badge copy, e.g. "~2 days left — Restock by Thursday". */
  label: string
  /** Compact copy, e.g. "~2 days left". */
  shortLabel: string
  /** Local calendar date to restock by, midnight local. */
  restockBy: Date | null
  /** "today", a weekday, or a short date. */
  restockByLabel: string | null
}

const UNKNOWN: SupplyInfo = {
  daysRemaining: null,
  level: "unknown",
  label: "Supply unknown — check schedule",
  shortLabel: "Supply unknown",
  restockBy: null,
  restockByLabel: null,
}

function pluralDays(days: number): string {
  return `${days} day${days === 1 ? "" : "s"}`
}

/**
 * The single source of truth for days-of-supply. Pure: no React, Supabase, or
 * browser globals beyond Date/Intl. Every medicine surface imports this.
 */
export function calculateSupply(
  stockOnHand: number,
  frequencyPerDay: number,
  now: Date = new Date(),
): SupplyInfo {
  if (
    !Number.isFinite(stockOnHand) ||
    !Number.isFinite(frequencyPerDay) ||
    !Number.isInteger(stockOnHand) ||
    !Number.isInteger(frequencyPerDay) ||
    stockOnHand < 0 ||
    frequencyPerDay < 1
  ) {
    return UNKNOWN
  }

  const daysRemaining = Math.floor(stockOnHand / frequencyPerDay)

  if (stockOnHand === 0) {
    return {
      daysRemaining: 0,
      level: "out",
      label: "Out of stock",
      shortLabel: "Out of stock",
      restockBy: startOfLocalDay(now),
      restockByLabel: "today",
    }
  }

  const restockBy = addLocalDays(startOfLocalDay(now), daysRemaining)
  const restockByLabel = formatRestockBy(restockBy, now)

  if (daysRemaining === 0) {
    return {
      daysRemaining,
      level: "critical",
      label: "Less than 1 day left — Restock today",
      shortLabel: "Less than 1 day left",
      restockBy,
      restockByLabel,
    }
  }

  const level: SupplyLevel =
    daysRemaining <= 2 ? "critical" : daysRemaining <= 7 ? "low" : "healthy"

  return {
    daysRemaining,
    level,
    label: `~${pluralDays(daysRemaining)} left — Restock by ${restockByLabel}`,
    shortLabel: `~${pluralDays(daysRemaining)} left`,
    restockBy,
    restockByLabel,
  }
}

/** Maps a supply level to an existing Badge variant. */
export function supplyBadgeVariant(
  level: SupplyLevel,
): "expired" | "expiring" | "outline" {
  if (level === "out" || level === "critical") return "expired"
  if (level === "low") return "expiring"
  return "outline"
}
