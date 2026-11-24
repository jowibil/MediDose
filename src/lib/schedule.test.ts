import { describe, expect, it } from "vitest"

import type { Medicine } from "@/types/medicine"
import {
  formatTime12h,
  occurrencesForDate,
  occurrencesForRange,
  timeSlotsForFrequency,
} from "@/lib/schedule"

function medicine(overrides: Partial<Medicine> = {}): Medicine {
  return {
    id: "m1",
    patientId: "p1",
    name: "Amoxicillin",
    dosageAmount: 500,
    dosageUnit: "mg",
    stock: 30,
    expirationDate: "2027-03-01",
    frequencyPerDay: 3,
    scheduleMode: "waking_hours",
    firstDoseTime: "08:00",
    customTimes: null,
    scheduleTimes: ["08:00", "15:00", "22:00"],
    treatmentEndDate: null,
    archivedAt: null,
    archivedDate: null,
    createdDate: "2026-11-01",
    createdAt: "2026-11-01T12:00:00.000Z",
    ...overrides,
  }
}

describe("timeSlotsForFrequency", () => {
  it.each([
    [1, ["08:00"]],
    [2, ["08:00", "22:00"]],
    [3, ["08:00", "15:00", "22:00"]],
    [5, ["08:00", "11:30", "15:00", "18:30", "22:00"]],
    [6, ["08:00", "10:48", "13:36", "16:24", "19:12", "22:00"]],
  ])("spreads %i doses across waking hours", (frequency, expected) => {
    expect(timeSlotsForFrequency(frequency, "08:00", "waking_hours", [])).toEqual(
      expected,
    )
  })

  it("falls back to strict intervals at the 22:00 cutoff", () => {
    expect(timeSlotsForFrequency(3, "22:00", "waking_hours", [])).toEqual([
      "06:00",
      "14:00",
      "22:00",
    ])
  })

  it("uses strict 24h intervals", () => {
    expect(timeSlotsForFrequency(4, "06:00", "strict_interval", [])).toEqual([
      "00:00",
      "06:00",
      "12:00",
      "18:00",
    ])
  })

  it("wraps midnight for strict intervals", () => {
    expect(timeSlotsForFrequency(3, "20:00", "strict_interval", [])).toEqual([
      "04:00",
      "12:00",
      "20:00",
    ])
  })

  it("sorts supplied custom times", () => {
    expect(
      timeSlotsForFrequency(3, "08:00", "custom", ["19:00", "08:00", "13:00"]),
    ).toEqual(["08:00", "13:00", "19:00"])
  })
})

describe("occurrences", () => {
  it("generates one occurrence per schedule slot", () => {
    const occurrences = occurrencesForDate(medicine(), "2026-11-25")
    expect(occurrences.map((o) => o.scheduledTime)).toEqual([
      "08:00",
      "15:00",
      "22:00",
    ])
    expect(occurrences.every((o) => o.status === "pending")).toBe(true)
  })

  it("does not generate before the creation date", () => {
    expect(occurrencesForDate(medicine(), "2026-10-31")).toEqual([])
  })

  it("stops at the treatment end date", () => {
    const med = medicine({ treatmentEndDate: "2026-11-27" })
    expect(occurrencesForDate(med, "2026-11-27")).toHaveLength(3)
    expect(occurrencesForDate(med, "2026-11-28")).toEqual([])
  })

  it("builds an inclusive range", () => {
    const occurrences = occurrencesForRange(medicine(), "2026-11-25", "2026-11-27")
    expect(occurrences).toHaveLength(9)
    expect(occurrences[0].scheduledDate).toBe("2026-11-25")
    expect(occurrences[8].scheduledDate).toBe("2026-11-27")
  })

  it("stops occurrences after the archive date but keeps earlier history", () => {
    const archived = medicine({
      archivedAt: "2026-11-20T00:00:00Z",
      archivedDate: "2026-11-20",
    })
    expect(occurrencesForDate(archived, "2026-11-25")).toEqual([])
    expect(occurrencesForDate(archived, "2026-11-20")).toHaveLength(3)
    expect(occurrencesForDate(archived, "2026-11-19")).toHaveLength(3)
  })

  it("formats 12-hour times", () => {
    expect(formatTime12h("08:00")).toBe("8:00 AM")
    expect(formatTime12h("00:30")).toBe("12:30 AM")
    expect(formatTime12h("12:00")).toBe("12:00 PM")
    expect(formatTime12h("15:05")).toBe("3:05 PM")
  })
})
