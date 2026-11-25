import { addISODays, parseISODate } from "@/lib/dates"
import type { DoseLogRow } from "@/lib/occurrences"
import { occurrenceKey, occurrencesForRange } from "@/lib/schedule"
import type { Medicine, SkipReason } from "@/types/medicine"

/**
 * One frozen slot in a week plan. It carries the medicine *name* as it was at
 * freeze time, so a later rename, purge, or archive cannot rewrite the week.
 */
export interface WeekSlot {
  medicineId: string
  medicineName: string
  scheduledDate: string
  scheduledTime: string
}

export interface WeekStats {
  planTracked: boolean
  expected: number
  taken: number
  skipped: number
  unscheduled: number
  /** taken ÷ expected, or null when nothing was expected. Never 0 for "no data". */
  adherenceRate: number | null
  skippedByReason: Partial<Record<SkipReason, number>>
}

/** Monday of the ISO week containing `todayIso`. */
export function currentWeekStart(todayIso: string): string {
  const day = parseISODate(todayIso).getDay()
  return addISODays(todayIso, day === 0 ? -6 : 1 - day)
}

export function weekRange(weekStart: string): { start: string; end: string } {
  return { start: weekStart, end: addISODays(weekStart, 6) }
}

/**
 * The week's plan, derived from the medicine's schedule as it is right now.
 * This is the only place that decides what a week contains; the RPC stores the
 * result verbatim after re-validating it.
 */
export function buildWeekSlots(
  medicines: Medicine[],
  weekStart: string,
): WeekSlot[] {
  const { start, end } = weekRange(weekStart)

  return medicines.flatMap((medicine) =>
    occurrencesForRange(medicine, start, end).map((occurrence) => ({
      medicineId: occurrence.medicineId,
      medicineName: medicine.name,
      scheduledDate: occurrence.scheduledDate,
      scheduledTime: occurrence.scheduledTime,
    })),
  )
}

export function weekSlotKey(slot: {
  medicineId: string
  scheduledDate: string
  scheduledTime: string
}): string {
  return occurrenceKey(slot.medicineId, slot.scheduledDate, slot.scheduledTime)
}

/**
 * Counters for one week. `slots` are the frozen ones — never re-derived here —
 * so editing a schedule afterwards cannot move a past week's numbers.
 *
 * An in-progress week only counts doses that were already due; a future date in
 * the same week is part of the plan but not part of the score.
 */
export function buildWeekStats({
  slots,
  logs,
  weekStart,
  todayIso,
  planTracked,
}: {
  slots: WeekSlot[]
  logs: DoseLogRow[]
  weekStart: string
  todayIso: string
  planTracked: boolean
}): WeekStats {
  const { start, end } = weekRange(weekStart)
  const cutoff = todayIso < end ? todayIso : end

  const dueSlots = slots.filter((slot) => slot.scheduledDate <= cutoff)
  const slotKeys = new Set(slots.map((slot) => weekSlotKey(slot)))
  const logByKey = new Map(
    logs.map((log) => [
      occurrenceKey(log.medicine_id, log.scheduled_date, log.scheduled_time),
      log,
    ]),
  )

  let taken = 0
  let skipped = 0
  const skippedByReason: Partial<Record<SkipReason, number>> = {}

  for (const slot of dueSlots) {
    const log = logByKey.get(weekSlotKey(slot))
    if (!log) continue
    if (log.status === "taken") {
      taken += 1
      continue
    }
    skipped += 1
    if (log.skip_reason) {
      skippedByReason[log.skip_reason] =
        (skippedByReason[log.skip_reason] ?? 0) + 1
    }
  }

  // A log with no frozen slot is real activity but not part of the denominator.
  const unscheduled = logs.filter(
    (log) =>
      log.scheduled_date >= start &&
      log.scheduled_date <= cutoff &&
      !slotKeys.has(
        occurrenceKey(log.medicine_id, log.scheduled_date, log.scheduled_time),
      ),
  ).length

  const expected = dueSlots.length

  return {
    planTracked,
    expected,
    taken,
    skipped,
    unscheduled,
    adherenceRate:
      expected > 0 ? Math.round((taken / expected) * 100) / 100 : null,
    skippedByReason,
  }
}

/**
 * Drops a medicine's future slots from a frozen week, mirroring what
 * remove_future_expected() does in the database. Past slots stay, so a dose
 * already counted never stops counting.
 */
export function removeFutureSlots(
  slots: WeekSlot[],
  medicineId: string,
  todayIso: string,
): { kept: WeekSlot[]; removed: WeekSlot[] } {
  const kept: WeekSlot[] = []
  const removed: WeekSlot[] = []

  for (const slot of slots) {
    if (slot.medicineId === medicineId && slot.scheduledDate > todayIso) {
      removed.push(slot)
    } else {
      kept.push(slot)
    }
  }

  return { kept, removed }
}

export function adherenceLabel(rate: number | null): string {
  if (rate === null) return "No scheduled doses"
  return `${Math.round(rate * 100)}% of scheduled doses`
}
