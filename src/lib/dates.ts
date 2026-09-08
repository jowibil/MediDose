/** Returns today at midnight, local time, as a Date. */
export function today(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

/** Parses a "YYYY-MM-DD" string into a local-midnight Date. */
export function parseISODate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number)
  return new Date(year, month - 1, day)
}

/** Formats a Date as "YYYY-MM-DD". */
export function toISODate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/** Whole number of days from today until the given ISO date (negative if past). */
export function daysUntil(iso: string): number {
  const target = parseISODate(iso)
  const diffMs = target.getTime() - today().getTime()
  return Math.round(diffMs / (1000 * 60 * 60 * 24))
}

/** True if the given ISO date is strictly before today. */
export function isPastDate(iso: string): boolean {
  return daysUntil(iso) < 0
}

/** Human-friendly relative label, e.g. "Expires in 12 days" / "Expired 3 days ago". */
export function formatDaysRemaining(iso: string): string {
  const days = daysUntil(iso)
  if (days < 0) return `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago`
  if (days === 0) return "Expires today"
  return `${days} day${days === 1 ? "" : "s"} left`
}
