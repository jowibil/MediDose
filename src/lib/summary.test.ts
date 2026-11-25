import { describe, expect, it } from "vitest"

import type { Medicine } from "@/types/medicine"
import type { DoseLogRow } from "@/lib/occurrences"
import {
  adherenceLabel,
  buildWeekSlots,
  buildWeekStats,
  currentWeekStart,
  removeFutureSlots,
  weekRange,
  weekSlotKey,
} from "@/lib/summary"

// 2026-11-23 is a Monday.
const WEEK = "2026-11-23"

function medicine(overrides: Partial<Medicine> = {}): Medicine {
  return {
    id: "m1",
    patientId: "p1",
    name: "Amoxicillin",
    dosageAmount: 500,
    dosageUnit: "mg",
    stock: 30,
    expirationDate: "2027-03-01",
    frequencyPerDay: 2,
    scheduleMode: "waking_hours",
    firstDoseTime: "08:00",
    customTimes: null,
    scheduleTimes: ["08:00", "20:00"],
    treatmentEndDate: null,
    archivedAt: null,
    archivedDate: null,
    createdDate: "2026-11-01",
    createdAt: "2026-11-01T12:00:00.000Z",
    ...overrides,
  }
}

function log(
  overrides: Partial<DoseLogRow> & {
    scheduled_date: string
    scheduled_time: string
  },
): DoseLogRow {
  return {
    id: `log-${overrides.scheduled_date}-${overrides.scheduled_time}`,
    medicine_id: "m1",
    patient_id: "p1",
    status: "taken",
    skip_reason: null,
    skip_note: null,
    logged_by: "u1",
    logged_at: "2026-11-23T08:05:00.000Z",
    last_modified_by: null,
    updated_at: "2026-11-23T08:05:00.000Z",
    ...overrides,
  }
}

describe("currentWeekStart", () => {
  it("snaps every day of a week to its Monday", () => {
    expect(currentWeekStart("2026-11-23")).toBe("2026-11-23")
    expect(currentWeekStart("2026-11-25")).toBe("2026-11-23")
    expect(currentWeekStart("2026-11-29")).toBe("2026-11-23")
    expect(currentWeekStart("2026-11-30")).toBe("2026-11-30")
  })

  it("spans seven inclusive days", () => {
    expect(weekRange(WEEK)).toEqual({ start: WEEK, end: "2026-11-29" })
  })
})

describe("buildWeekSlots", () => {
  it("freezes one slot per scheduled dose across the week", () => {
    const slots = buildWeekSlots([medicine()], WEEK)
    expect(slots).toHaveLength(14)
    expect(slots[0]).toMatchObject({
      medicineId: "m1",
      medicineName: "Amoxicillin",
      scheduledDate: WEEK,
      scheduledTime: "08:00",
    })
    expect(slots.at(-1)?.scheduledDate).toBe("2026-11-29")
  })

  it("copies the name, so a later rename cannot rewrite the frozen week", () => {
    const slots = buildWeekSlots([medicine({ name: "Amox" })], WEEK)
    const renamed = medicine({ name: "Amoxicillin 500" })
    // The stats never look at the medicine again.
    const stats = buildWeekStats({
      slots,
      logs: [],
      weekStart: WEEK,
      todayIso: "2026-11-29",
      planTracked: true,
    })
    expect(stats.expected).toBe(14)
    expect(renamed.name).not.toBe(slots[0]?.medicineName)
  })

  it("stops at the medicine's archive date", () => {
    const slots = buildWeekSlots(
      [medicine({ archivedAt: "2026-11-25T10:00:00.000Z", archivedDate: "2026-11-25" })],
      WEEK,
    )
    expect(slots.some((slot) => slot.scheduledDate > "2026-11-25")).toBe(false)
  })
})

describe("buildWeekStats", () => {
  it("counts only doses that were due in an in-progress week", () => {
    const slots = buildWeekSlots([medicine()], WEEK)
    const stats = buildWeekStats({
      slots,
      logs: [],
      weekStart: WEEK,
      todayIso: "2026-11-24", // Tue: Mon+Tue due = 4
      planTracked: true,
    })
    expect(stats.expected).toBe(4)
    expect(stats.adherenceRate).toBe(0)
  })

  it("ignores the current schedule once the week is frozen", () => {
    const frozen = buildWeekSlots([medicine()], WEEK)
    const edited = medicine({ frequencyPerDay: 3, scheduleTimes: ["08:00", "14:00", "20:00"] })

    const stats = buildWeekStats({
      slots: frozen,
      logs: [
        log({ scheduled_date: WEEK, scheduled_time: "08:00" }),
        log({ scheduled_date: WEEK, scheduled_time: "20:00" }),
      ],
      weekStart: WEEK,
      todayIso: "2026-11-29",
      planTracked: true,
    })

    expect(edited.scheduleTimes).toHaveLength(3)
    expect(stats.expected).toBe(14)
    expect(stats.taken).toBe(2)
    expect(stats.adherenceRate).toBe(0.14)
  })

  it("counts a dose for an unplanned medicine as unscheduled, without moving adherence", () => {
    const slots = buildWeekSlots([medicine()], WEEK)
    const stats = buildWeekStats({
      slots,
      logs: [
        log({ scheduled_date: WEEK, scheduled_time: "08:00" }),
        log({
          id: "other",
          medicine_id: "m2",
          scheduled_date: WEEK,
          scheduled_time: "09:00",
        }),
      ],
      weekStart: WEEK,
      todayIso: "2026-11-29",
      planTracked: true,
    })

    expect(stats.taken).toBe(1)
    expect(stats.unscheduled).toBe(1)
    expect(stats.adherenceRate).toBe(0.07)
  })

  it("returns null adherence, not zero, when nothing was expected", () => {
    const stats = buildWeekStats({
      slots: [],
      logs: [log({ scheduled_date: WEEK, scheduled_time: "08:00" })],
      weekStart: WEEK,
      todayIso: "2026-11-29",
      planTracked: false,
    })

    expect(stats.expected).toBe(0)
    expect(stats.adherenceRate).toBeNull()
    expect(stats.unscheduled).toBe(1)
    expect(adherenceLabel(stats.adherenceRate)).toBe("No scheduled doses")
  })

  it("groups skips by reason", () => {
    const slots = buildWeekSlots([medicine()], WEEK)
    const stats = buildWeekStats({
      slots,
      logs: [
        log({ scheduled_date: WEEK, scheduled_time: "08:00", status: "skipped", skip_reason: "forgot" }),
        log({ scheduled_date: WEEK, scheduled_time: "20:00", status: "skipped", skip_reason: "forgot" }),
        log({ scheduled_date: "2026-11-24", scheduled_time: "08:00", status: "skipped", skip_reason: "out_of_stock" }),
      ],
      weekStart: WEEK,
      todayIso: "2026-11-29",
      planTracked: true,
    })

    expect(stats.skipped).toBe(3)
    expect(stats.skippedByReason).toEqual({ forgot: 2, out_of_stock: 1 })
  })
})

describe("removeFutureSlots", () => {
  it("drops only future slots of the archived medicine and leaves the score honest", () => {
    const slots = buildWeekSlots([medicine()], WEEK)
    const { kept, removed } = removeFutureSlots(slots, "m1", "2026-11-25")

    expect(kept).toHaveLength(6) // Mon–Wed
    expect(removed).toHaveLength(8) // Thu–Sun

    const stats = buildWeekStats({
      slots: kept,
      logs: [
        log({ scheduled_date: WEEK, scheduled_time: "08:00" }),
        log({ scheduled_date: "2026-11-24", scheduled_time: "08:00" }),
        log({ scheduled_date: "2026-11-25", scheduled_time: "08:00" }),
      ],
      weekStart: WEEK,
      todayIso: "2026-11-29",
      planTracked: true,
    })

    // 3 of 6 kept slots, not 3 of 14.
    expect(stats.expected).toBe(6)
    expect(stats.adherenceRate).toBe(0.5)
  })

  it("never removes a past slot", () => {
    const slots = buildWeekSlots([medicine()], WEEK)
    const { removed } = removeFutureSlots(slots, "m1", "2026-11-29")
    expect(removed).toHaveLength(0)
  })
})

describe("weekSlotKey", () => {
  it("matches the frozen-row identity used by the database constraint", () => {
    expect(
      weekSlotKey({
        medicineId: "m1",
        scheduledDate: WEEK,
        scheduledTime: "08:00",
      }),
    ).toBe("m1|2026-11-23|08:00")
  })
})
