/**
 * Pure calendar-date helpers. All display functions take an explicit "today"
 * so they stay deterministic in tests; nothing here reads the browser clock
 * except the explicit `todayISO()`/`getTodayInTimeZone()` entry points.
 */

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/

/** True for a well-formed, real YYYY-MM-DD calendar date. */
export function isValidISODate(iso: string): boolean {
  if (!ISO_DATE_REGEX.test(iso)) return false
  const [year, month, day] = iso.split("-").map(Number)
  const date = new Date(year, month - 1, day)
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  )
}

export function isValidTime(time: string): boolean {
  return TIME_REGEX.test(time)
}

/** Parses "YYYY-MM-DD" into a local-midnight Date. */
export function parseISODate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number)
  return new Date(year, month - 1, day)
}

/** Formats a Date as "YYYY-MM-DD" using its local calendar fields. */
export function toISODate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/** Midnight local time for a date. */
export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/** Adds calendar days without millisecond offsets, so DST never shifts the day. */
export function addLocalDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

/** Adds calendar days to an ISO date string. */
export function addISODays(iso: string, days: number): string {
  return toISODate(addLocalDays(parseISODate(iso), days))
}

/** Today's local ISO date in a specific IANA timezone (falls back to UTC). */
export function getTodayInTimeZone(timeZone: string = "UTC"): string {
  const date = new Date()
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date)
    const values: Record<string, string> = {}
    for (const part of parts) {
      if (part.type !== "literal") values[part.type] = part.value
    }
    if (values.year && values.month && values.day) {
      return `${values.year}-${values.month}-${values.day}`
    }
  } catch {
    // Invalid IANA name: fall through to UTC.
  }
  return toISODate(date)
}

/** The browser/server local calendar date. */
export function todayISO(): string {
  return toISODate(new Date())
}

/** Whole calendar days from `todayIso` until `iso` (negative when past). */
export function daysUntil(iso: string, todayIso: string): number {
  const target = parseISODate(iso)
  const today = parseISODate(todayIso)
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

export function isPastDate(iso: string, todayIso: string): boolean {
  return daysUntil(iso, todayIso) < 0
}

/** "Expired 3 days ago" / "Expires today" / "12 days left". */
export function formatDaysRemaining(iso: string, todayIso: string): string {
  const days = daysUntil(iso, todayIso)
  if (days < 0) {
    const count = Math.abs(days)
    return `Expired ${count} day${count === 1 ? "" : "s"} ago`
  }
  if (days === 0) return "Expires today"
  return `${days} day${days === 1 ? "" : "s"} left`
}

/**
 * Label for a restock-by date relative to a "now" date: "today", a weekday
 * name when 1-6 days away, or a short date ("Dec 3") at 7+ days.
 */
export function formatRestockBy(date: Date, now: Date): string {
  const days = Math.round(
    (startOfLocalDay(date).getTime() - startOfLocalDay(now).getTime()) /
      86_400_000,
  )
  if (days <= 0) return "today"
  if (days <= 6) {
    return new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(date)
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date)
}

/** Format a date-only ISO string without timezone drift (formatted in UTC). */
export function formatDateLabel(
  iso: string,
  options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
  },
): string {
  const [year, month, day] = iso.split("-").map(Number)
  return new Intl.DateTimeFormat("en-US", {
    ...options,
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

export function formatLongDate(iso: string): string {
  return formatDateLabel(iso, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  })
}

/** "HH:MM:SS" (Postgres time) -> "HH:MM". */
export function normalizeTime(time: string): string {
  return time.slice(0, 5)
}
