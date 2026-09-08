// src/lib/schedule.ts
import type { Medicine, ScheduledDose } from "@/types/medicine"
import { today, toISODate } from "@/lib/dates"

const SCHEDULE_DAYS = 7
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
 * 1. "waking_hours" (Default): Spreads doses between firstDoseTime and 10:00 PM.
 * 2. "strict_interval": Calculates exact 24/N intervals (e.g., 4x/day -> every 6 hours).
 * 3. "custom": Returns the explicitly specified custom times array.
 */
export function timeSlotsForFrequency(
  frequency: number,
  firstDoseTime: string = DEFAULT_FIRST_DOSE_TIME,
  scheduleMode: "waking_hours" | "strict_interval" | "custom" = "waking_hours",
  customTimes: string[] = []
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
  let windowMins = endMins - startMins

  // Fallback to strict 24h interval if starting at or after waking cutoff
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

/** Builds the full 7-day set of scheduled doses for one medicine, starting today. */
export function generateScheduleForMedicine(medicine: Medicine): ScheduledDose[] {
  const slots = timeSlotsForFrequency(
    medicine.frequencyPerDay,
    medicine.firstDoseTime,
    medicine.scheduleMode,
    medicine.customTimes
  )
  const doses: ScheduledDose[] = []
  const start = today()

  for (let dayOffset = 0; dayOffset < SCHEDULE_DAYS; dayOffset++) {
    const date = new Date(start)
    date.setDate(date.getDate() + dayOffset)
    const iso = toISODate(date)

    // Stop generating schedule slots past the treatment end date
    if (medicine.treatmentEndDate && iso > medicine.treatmentEndDate) {
      break
    }

    slots.forEach((time, slotIndex) => {
      doses.push({
        id: `${medicine.id}-${iso}-${slotIndex}`,
        medicineId: medicine.id,
        date: iso,
        time,
        taken: false,
      })
    })
  }

  return doses
}

/** Formats a "HH:MM" 24hr time string as 12hr with AM/PM, e.g. "08:00" -> "8:00 AM". */
export function formatTime12h(time: string): string {
  const [hours, minutes] = time.split(":").map(Number)
  const period = hours >= 12 ? "PM" : "AM"
  const hour12 = hours % 12 === 0 ? 12 : hours % 12
  return `${hour12}:${String(minutes).padStart(2, "0")} ${period}`
}