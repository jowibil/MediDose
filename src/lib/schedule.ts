import type { DoseOccurrence, Medicine, ScheduleMode } from "@/types/medicine"
import { addLocalDays, parseISODate, toISODate } from "@/lib/dates"

/** Default first dose of the day when a medicine has no custom start time set. */
const DEFAULT_FIRST_DOSE_TIME = "08:00"
/** Waking hours cutoff for Waking Hours mode (10:00 PM). */
const WAKING_HOURS_END = "22:00"

/** Converts "HH:MM" 24hr string into total minutes from midnight. */
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number)
  return hours * 60 + minutes
}

/** Formats total minutes from midnight into a "HH:MM" 24hr string. */
function minutesToTime(totalMinutes: number): string {
  const wrapped = ((totalMinutes % 1440) + 1440) % 1440
  const hours = Math.floor(wrapped / 60)
  const mins = Math.round(wrapped % 60)
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`
}

/**
 * Calculates schedule time slots based on the medicine's schedule mode:
 * 1. "waking_hours" (default): spreads doses between firstDoseTime and 10:00 PM.
 * 2. "strict_interval": exact 24/N intervals (4x/day -> every 6 hours).
 * 3. "custom": the explicitly supplied times, sorted.
 */
export function timeSlotsForFrequency(
  frequency: number,
  firstDoseTime: string = DEFAULT_FIRST_DOSE_TIME,
  scheduleMode: ScheduleMode = "waking_hours",
  customTimes: string[] = [],
): string[] {
  if (scheduleMode === "custom" && customTimes.length > 0) {
    return [...customTimes].sort()
  }

  if (frequency <= 1) {
    return [firstDoseTime]
  }

  const startMins = timeToMinutes(firstDoseTime)

  if (scheduleMode === "strict_interval") {
    const intervalMins = Math.round((24 / frequency) * 60)
    const slots: string[] = []
    for (let i = 0; i < frequency; i++) {
      slots.push(minutesToTime(startMins + i * intervalMins))
    }
    return slots.sort()
  }

  // Default: "waking_hours" mode
  const endMins = timeToMinutes(WAKING_HOURS_END)
  const windowMins = endMins - startMins

  // Fall back to strict 24h intervals if starting at or after the cutoff.
  if (windowMins <= 0) {
    const intervalMins = Math.round((24 / frequency) * 60)
    const slots: string[] = []
    for (let i = 0; i < frequency; i++) {
      slots.push(minutesToTime(startMins + i * intervalMins))
    }
    return slots.sort()
  }

  const step = windowMins / (frequency - 1)
  const slots: string[] = []
  for (let i = 0; i < frequency; i++) {
    slots.push(minutesToTime(startMins + Math.round(i * step)))
  }
  return slots.sort()
}

/** The daily slots actually stored on a medicine (falls back to the algorithm). */
export function scheduleTimesForMedicine(medicine: Medicine): string[] {
  if (medicine.scheduleTimes.length > 0) return medicine.scheduleTimes
  return timeSlotsForFrequency(
    medicine.frequencyPerDay,
    medicine.firstDoseTime,
    medicine.scheduleMode,
    medicine.customTimes ?? [],
  )
}

/**
 * True when a date falls within the medicine's active window. Archived
 * medicines stop generating occurrences after their archive date but keep
 * their earlier history readable.
 */
export function isMedicineActiveOn(
  medicine: Medicine,
  dateIso: string,
): boolean {
  if (dateIso < medicine.createdDate) return false
  if (medicine.archivedDate && dateIso > medicine.archivedDate) return false
  if (medicine.treatmentEndDate && dateIso > medicine.treatmentEndDate) {
    return false
  }
  return true
}

/** Pending occurrences for one medicine on one local date. */
export function occurrencesForDate(
  medicine: Medicine,
  dateIso: string,
): DoseOccurrence[] {
  if (!isMedicineActiveOn(medicine, dateIso)) return []
  return scheduleTimesForMedicine(medicine).map((time) => ({
    medicineId: medicine.id,
    patientId: medicine.patientId,
    scheduledDate: dateIso,
    scheduledTime: time,
    status: "pending" as const,
  }))
}

/** Pending occurrences for one medicine across an inclusive date range. */
export function occurrencesForRange(
  medicine: Medicine,
  startIso: string,
  endIso: string,
): DoseOccurrence[] {
  if (endIso < startIso) return []
  const occurrences: DoseOccurrence[] = []
  let cursor = parseISODate(startIso)
  const end = parseISODate(endIso)

  while (cursor.getTime() <= end.getTime()) {
    occurrences.push(...occurrencesForDate(medicine, toISODate(cursor)))
    cursor = addLocalDays(cursor, 1)
  }

  return occurrences
}

/** Stable identity for an occurrence, matching the DB unique constraint. */
export function occurrenceKey(
  medicineId: string,
  date: string,
  time: string,
): string {
  return `${medicineId}|${date}|${time}`
}

/** Formats a "HH:MM" 24hr time string as 12hr with AM/PM, e.g. "8:00 AM". */
export function formatTime12h(time: string): string {
  const [hours, minutes] = time.split(":").map(Number)
  const period = hours >= 12 ? "PM" : "AM"
  const hour12 = hours % 12 === 0 ? 12 : hours % 12
  return `${hour12}:${String(minutes).padStart(2, "0")} ${period}`
}
