import type { DoseOccurrence, Medicine, ScheduleMode } from "@/types/medicine"
import {
  addLocalDays,
  normalizeTime,
  parseISODate,
  toISODate,
} from "@/lib/dates"

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
 * The daily slots in the order they are taken, starting at the first dose.
 *
 * `schedule_times` is stored sorted by clock time, so a strict cycle that wraps
 * past midnight is saved as "03:00", "09:00", "15:00", "21:00" — which reads as
 * if the day began at 3:00 AM. Rotating to the first dose restores the regimen
 * as it was prescribed: 3:00 PM, 9:00 PM, 3:00 AM, 9:00 AM.
 */
export function scheduleTimesInIntakeOrder(medicine: Medicine): string[] {
  // A custom schedule was typed time by time, so the typed order is the one the
  // owner asked for; `custom_times` keeps it while `schedule_times` is sorted.
  if (medicine.scheduleMode === "custom" && medicine.customTimes?.length) {
    return medicine.customTimes.map((time) => normalizeTime(time))
  }

  const times = scheduleTimesForMedicine(medicine)
    .map((time) => normalizeTime(time))
    .sort()

  if (medicine.scheduleMode !== "strict_interval" || times.length < 2) {
    return times
  }

  const start = times.indexOf(normalizeTime(medicine.firstDoseTime))
  return start <= 0 ? times : [...times.slice(start), ...times.slice(0, start)]
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

/**
 * Local clock time ("HH:MM") of an ISO timestamp, or null when either the
 * timestamp or the timezone cannot be read. Only a medicine's creation day
 * needs it, so an unusable value just leaves the schedule's start in charge.
 */
function clockTimeInTimeZone(
  isoTimestamp: string,
  timeZone: string,
): string | null {
  const instant = new Date(isoTimestamp)
  if (Number.isNaN(instant.getTime())) return null

  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(instant)
    const hour = parts.find((part) => part.type === "hour")?.value
    const minute = parts.find((part) => part.type === "minute")?.value
    return hour && minute ? `${hour}:${minute}` : null
  } catch {
    return null
  }
}

/**
 * The clock time a medicine's first day starts at: its first dose of the day,
 * or the moment it was added when that is later.
 *
 * A schedule is a whole day of clock times, so without this the doses that had
 * already passed when the medicine was added appear as pending on its own first
 * day. A strict cycle stored as 03:00/09:00/15:00/21:00 put a 3:00 AM dose on
 * the dashboard for a medicine added at 3:00 PM; a custom schedule typed as
 * 15:00/21:00/03:00/09:00 did the same; and a waking-hours medicine added in
 * the afternoon showed the 8:00 AM first dose. Each one asked for a log of a
 * dose that was never due.
 */
function firstDayStartTime(medicine: Medicine, timeZone?: string): string {
  const firstDose = normalizeTime(
    scheduleTimesInIntakeOrder(medicine)[0] ?? medicine.firstDoseTime,
  )
  const addedAt = timeZone
    ? clockTimeInTimeZone(medicine.createdAt, timeZone)
    : null
  return addedAt && addedAt > firstDose ? addedAt : firstDose
}

/**
 * Pending occurrences for one medicine on one local date.
 *
 * Only the creation day is trimmed. Every later day keeps the whole set,
 * because a slot before the first dose belongs to the cycle that began the
 * previous day.
 */
export function occurrencesForDate(
  medicine: Medicine,
  dateIso: string,
  timeZone?: string,
): DoseOccurrence[] {
  if (!isMedicineActiveOn(medicine, dateIso)) return []
  const firstDayStart =
    dateIso === medicine.createdDate
      ? firstDayStartTime(medicine, timeZone)
      : null
  return scheduleTimesForMedicine(medicine)
    .filter((time) => firstDayStart === null || normalizeTime(time) >= firstDayStart)
    .map((time) => ({
      medicineId: medicine.id,
      patientId: medicine.patientId,
      scheduledDate: dateIso,
      scheduledTime: time,
      status: "pending" as const,
    }))
}

/**
 * Pending occurrences for one medicine across an inclusive date range. Pass the
 * household timezone so the creation day starts at the local time it was added.
 */
export function occurrencesForRange(
  medicine: Medicine,
  startIso: string,
  endIso: string,
  timeZone?: string,
): DoseOccurrence[] {
  if (endIso < startIso) return []
  const occurrences: DoseOccurrence[] = []
  let cursor = parseISODate(startIso)
  const end = parseISODate(endIso)

  while (cursor.getTime() <= end.getTime()) {
    occurrences.push(...occurrencesForDate(medicine, toISODate(cursor), timeZone))
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
