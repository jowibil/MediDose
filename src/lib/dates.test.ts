import { describe, expect, it } from "vitest"

import {
  addISODays,
  addLocalDays,
  daysUntil,
  formatDateLabel,
  formatDaysRemaining,
  formatRestockBy,
  getTodayInTimeZone,
  isValidISODate,
  parseISODate,
  toISODate,
} from "@/lib/dates"

describe("ISO date helpers", () => {
  it("round-trips local dates", () => {
    expect(toISODate(parseISODate("2026-11-25"))).toBe("2026-11-25")
  })

  it("rejects impossible dates", () => {
    expect(isValidISODate("2026-11-25")).toBe(true)
    expect(isValidISODate("2026-02-30")).toBe(false)
    expect(isValidISODate("11/25/2026")).toBe(false)
  })

  it("adds calendar days across month and year boundaries", () => {
    expect(addISODays("2026-11-30", 2)).toBe("2026-12-02")
    expect(addISODays("2026-12-31", 1)).toBe("2027-01-01")
    expect(addISODays("2026-03-01", -1)).toBe("2026-02-28")
  })

  it("adds local days without DST drift", () => {
    const result = addLocalDays(new Date(2026, 9, 31, 12, 0, 0), 1)
    expect(result.getDate()).toBe(1)
    expect(result.getMonth()).toBe(10)
  })

  it("counts calendar days between ISO dates", () => {
    expect(daysUntil("2026-11-27", "2026-11-25")).toBe(2)
    expect(daysUntil("2026-11-24", "2026-11-25")).toBe(-1)
    expect(daysUntil("2026-11-25", "2026-11-25")).toBe(0)
  })

  it("formats expiration copy", () => {
    expect(formatDaysRemaining("2026-11-25", "2026-11-25")).toBe("Expires today")
    expect(formatDaysRemaining("2026-11-26", "2026-11-25")).toBe("1 day left")
    expect(formatDaysRemaining("2026-12-05", "2026-11-25")).toBe("10 days left")
    expect(formatDaysRemaining("2026-11-22", "2026-11-25")).toBe(
      "Expired 3 days ago",
    )
    expect(formatDaysRemaining("2026-11-24", "2026-11-25")).toBe(
      "Expired 1 day ago",
    )
  })

  it("formats restock-by labels", () => {
    const now = new Date(2026, 10, 25, 10, 0, 0)
    expect(formatRestockBy(new Date(2026, 10, 25), now)).toBe("today")
    expect(formatRestockBy(new Date(2026, 10, 26), now)).toBe("Thursday")
    expect(formatRestockBy(new Date(2026, 11, 1), now)).toBe("Tuesday")
    expect(formatRestockBy(new Date(2026, 11, 2), now)).toBe("Dec 2")
  })

  it("formats date labels in UTC without shifting the day", () => {
    expect(formatDateLabel("2026-11-25")).toBe("Wed, Nov 25")
  })

  it("falls back to a valid date for an invalid timezone", () => {
    expect(getTodayInTimeZone("Not/AZone")).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
