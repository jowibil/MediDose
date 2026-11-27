/**
 * Explicit "every N hours" schedules.
 *
 * `schedule.ts` owns the slot algorithm for waking-hours and the legacy strict
 * mode, where the step is derived as 24 / frequency. The add/edit form now lets
 * the owner state the interval outright, so that variant lives here. Both paths
 * write `medicines.schedule_times`, which stays the authoritative slot list.
 */

export const MIN_INTERVAL_HOURS = 1
export const MAX_INTERVAL_HOURS = 24

/** Converts "HH:MM" 24hr string into total minutes from midnight. */
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number)
  return hours * 60 + minutes
}

/** Formats total minutes from midnight into a "HH:MM" 24hr string. */
function minutesToTime(totalMinutes: number): string {
  const wrapped = ((Math.round(totalMinutes) % 1440) + 1440) % 1440
  const hours = Math.floor(wrapped / 60)
  const minutes = wrapped % 60
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
}

/** The interval that keeps the old strict behaviour: 24 / frequency hours. */
export function defaultIntervalHours(frequency: number): string {
  const count = Math.max(1, Math.trunc(frequency))
  return String(Math.round((24 / count) * 100) / 100)
}

/**
 * Largest interval that still fits `frequency` distinct doses inside 24 hours.
 * The DB requires `schedule_times` to hold exactly `frequency` unique times, so
 * a longer interval would either collide or wrap onto an existing slot.
 */
export function maxIntervalHours(frequency: number): number {
  const count = Math.max(1, Math.trunc(frequency))
  return Math.round((1440 / count / 60) * 100) / 100
}

export function validateIntervalHours(
  value: string | number,
  frequency: number,
): string | null {
  const raw = typeof value === "number" ? String(value) : value.trim()
  if (!raw) return "Enter how many hours apart each dose is."

  const hours = Number(raw)
  if (
    !Number.isFinite(hours) ||
    hours < MIN_INTERVAL_HOURS ||
    hours > MAX_INTERVAL_HOURS
  ) {
    return `Enter a number of hours between ${MIN_INTERVAL_HOURS} and ${MAX_INTERVAL_HOURS}.`
  }

  const count = Math.max(1, Math.trunc(frequency))
  if (Math.round(hours * 60) * count > 1440) {
    const max = maxIntervalHours(count)
    return `${count} doses can't be ${raw} hours apart inside one day. Use ${max} hour${max === 1 ? "" : "s"} or fewer, or lower the frequency.`
  }

  return null
}

/**
 * Slots spaced exactly `intervalHours` apart from the first dose, wrapping past
 * midnight, in the order they are taken (first dose first). Callers validate
 * first; an unusable interval returns no slots so the preview can show its hint
 * instead of a broken list.
 */
export function strictIntervalDoseSlots(
  frequency: number,
  firstDoseTime: string,
  intervalHours: number,
): string[] {
  const count = Math.max(1, Math.trunc(frequency))
  if (!Number.isFinite(intervalHours) || intervalHours <= 0) return []

  const step = Math.round(intervalHours * 60)
  if (step <= 0) return []

  const startMins = timeToMinutes(firstDoseTime)
  if (!Number.isFinite(startMins)) return []

  const slots: string[] = []
  for (let index = 0; index < count; index++) {
    slots.push(minutesToTime(startMins + index * step))
  }
  return slots
}

/**
 * The same slots sorted by clock time, which is what `schedule_times` stores and
 * what every other surface reads.
 */
export function strictIntervalSlots(
  frequency: number,
  firstDoseTime: string,
  intervalHours: number,
): string[] {
  return strictIntervalDoseSlots(frequency, firstDoseTime, intervalHours).sort()
}

/**
 * Minutes from the cycle's last dose to the next cycle's first dose when
 * `N × frequency` is under 24 hours, so the overnight gap can be stated. Zero
 * when the interval fills the day (continuous dosing), for a single daily dose,
 * or for an unusable interval.
 */
export function strictCycleWaitMinutes(
  frequency: number,
  intervalHours: number,
): number {
  if (!Number.isFinite(intervalHours) || intervalHours <= 0) return 0

  const count = Math.max(1, Math.trunc(frequency))
  if (count < 2) return 0

  const step = Math.round(intervalHours * 60)
  if (step * count >= 1440) return 0

  return 1440 - (count - 1) * step
}

/**
 * Recovers the interval a strict medicine was saved with from its stored slots,
 * so editing shows the owner's N rather than resetting it to 24 / frequency.
 */
export function intervalHoursFromSchedule(
  scheduleTimes: string[],
  firstDoseTime: string,
  frequency: number,
): string {
  const fallback = defaultIntervalHours(frequency)
  if (scheduleTimes.length === 0) return fallback

  const startMins = timeToMinutes(firstDoseTime)
  const gaps = scheduleTimes
    .map((time) => (timeToMinutes(time) - startMins + 1440) % 1440)
    .filter((gap) => gap > 0)

  if (gaps.length === 0) return fallback

  const smallest = Math.min(...gaps)
  return String(Math.round((smallest / 60) * 100) / 100)
}
