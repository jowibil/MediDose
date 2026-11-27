import { describe, expect, it } from "vitest"

import {
  defaultIntervalHours,
  intervalHoursFromSchedule,
  strictCycleWaitMinutes,
  strictIntervalDoseSlots,
  strictIntervalSlots,
  validateIntervalHours,
} from "@/lib/schedule-interval"

describe("strictIntervalSlots", () => {
  it("uses the stated interval instead of 24 / frequency", () => {
    expect(strictIntervalSlots(4, "08:00", 4)).toEqual([
      "08:00",
      "12:00",
      "16:00",
      "20:00",
    ])
  })

  it("wraps past midnight when the interval fills the day", () => {
    expect(strictIntervalSlots(4, "08:00", 6)).toEqual([
      "02:00",
      "08:00",
      "14:00",
      "20:00",
    ])
  })

  it("keeps one slot for a once-daily medicine", () => {
    expect(strictIntervalSlots(1, "09:30", 24)).toEqual(["09:30"])
  })

  it("supports the 4.8 hour default of a 5x/day medicine", () => {
    expect(strictIntervalSlots(5, "08:00", Number(defaultIntervalHours(5)))).toEqual([
      "03:12",
      "08:00",
      "12:48",
      "17:36",
      "22:24",
    ])
  })
})

describe("strictIntervalDoseSlots", () => {
  it("starts at the first dose and keeps intake order across midnight", () => {
    expect(strictIntervalDoseSlots(4, "16:00", 4)).toEqual([
      "16:00",
      "20:00",
      "00:00",
      "04:00",
    ])
  })

  it("holds the same set as the stored, sorted slots", () => {
    expect([...strictIntervalDoseSlots(4, "16:00", 4)].sort()).toEqual(
      strictIntervalSlots(4, "16:00", 4),
    )
  })
})

describe("strictCycleWaitMinutes", () => {
  it("reports the wait from the last dose to the next cycle", () => {
    // 4 PM → 8 PM → 12 AM → 4 AM, then the next cycle's 4 PM dose.
    expect(strictCycleWaitMinutes(4, 4)).toBe(720)
  })

  it("is zero when the interval fills 24 hours", () => {
    expect(strictCycleWaitMinutes(4, 6)).toBe(0)
    expect(strictCycleWaitMinutes(5, 4.8)).toBe(0)
  })

  it("is zero for a single daily dose or an unusable interval", () => {
    expect(strictCycleWaitMinutes(1, 4)).toBe(0)
    expect(strictCycleWaitMinutes(4, 0)).toBe(0)
  })
})

describe("validateIntervalHours", () => {
  it("rejects an interval that cannot fit the daily frequency", () => {
    expect(validateIntervalHours("5", 5)).toMatch(/or fewer/)
  })

  it("accepts intervals that fit", () => {
    expect(validateIntervalHours("4", 4)).toBeNull()
    expect(validateIntervalHours("4.8", 5)).toBeNull()
  })

  it("rejects missing or out-of-range values", () => {
    expect(validateIntervalHours("", 4)).toBeTruthy()
    expect(validateIntervalHours("0", 4)).toBeTruthy()
    expect(validateIntervalHours("25", 1)).toBeTruthy()
  })
})

describe("intervalHoursFromSchedule", () => {
  it("recovers the interval from stored slots", () => {
    expect(
      intervalHoursFromSchedule(["08:00", "12:00", "16:00", "20:00"], "08:00", 4),
    ).toBe("4")
  })

  it("recovers a wrapped interval", () => {
    expect(
      intervalHoursFromSchedule(["02:00", "08:00", "14:00", "20:00"], "08:00", 4),
    ).toBe("6")
  })

  it("falls back to 24 / frequency without slots", () => {
    expect(intervalHoursFromSchedule([], "08:00", 4)).toBe("6")
  })
})
