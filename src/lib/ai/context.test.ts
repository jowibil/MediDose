import { describe, expect, it } from "vitest"

import type { Medicine } from "@/types/medicine"
import type { DoseLogRow } from "@/lib/occurrences"
import { buildMedicineContext, serializeContext } from "@/lib/ai/context"

const TODAY = "2026-11-25"

function medicine(overrides: Partial<Medicine> = {}): Medicine {
  return {
    id: "m1",
    patientId: "p1",
    name: "Amoxicillin",
    dosageAmount: 500,
    dosageUnit: "mg",
    stock: 12,
    expirationDate: "2027-01-10",
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

function log(overrides: Partial<DoseLogRow> = {}): DoseLogRow {
  return {
    id: "log-1",
    medicine_id: "m1",
    patient_id: "p1",
    scheduled_date: TODAY,
    scheduled_time: "08:00",
    status: "taken",
    skip_reason: null,
    skip_note: null,
    logged_by: "u1",
    logged_at: `${TODAY}T08:05:00.000Z`,
    last_modified_by: null,
    updated_at: `${TODAY}T08:05:00.000Z`,
    ...overrides,
  }
}

describe("buildMedicineContext", () => {
  it("contains only the resolved patient's records", () => {
    const alexMedicine = medicine()
    const samMedicine = medicine({
      id: "m2",
      patientId: "p2",
      name: "Metformin",
      dosageAmount: 850,
    })

    const context = buildMedicineContext({
      patient: { name: "Alex Rivera" },
      medicines: [alexMedicine],
      logs: [log()],
      todayIso: TODAY,
    })

    const serialized = serializeContext(context)
    expect(serialized).toContain("Alex Rivera")
    expect(serialized).toContain("Amoxicillin")
    expect(serialized).not.toContain("Metformin")
    expect(serialized).not.toContain("Sam")

    // A sibling's medicine existing in the same household is irrelevant: it was
    // never handed to the builder.
    expect(samMedicine.patientId).toBe("p2")
  })

  it("carries no identifiers, emails, or internal keys", () => {
    const context = buildMedicineContext({
      patient: { name: "Alex" },
      medicines: [medicine()],
      logs: [log()],
      todayIso: TODAY,
    })

    const serialized = serializeContext(context)
    expect(serialized).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i)
    expect(serialized).not.toContain("m1")
    expect(serialized).not.toContain("u1")
    expect(serialized).not.toContain("patient_id")
    expect(serialized).not.toContain("@")
  })

  it("lists the active cabinet only, with stock and expiry distance", () => {
    const context = buildMedicineContext({
      patient: { name: "Alex" },
      medicines: [
        medicine(),
        medicine({
          id: "m9",
          name: "Old syrup",
          archivedAt: "2026-11-20T00:00:00.000Z",
          archivedDate: "2026-11-20",
        }),
      ],
      logs: [],
      todayIso: TODAY,
    })

    expect(context.medicines).toHaveLength(1)
    expect(context.medicines[0]).toMatchObject({
      name: "Amoxicillin",
      dosage: "500mg",
      stock: 12,
      schedule: "08:00, 20:00",
    })
    expect(context.medicines[0]?.expiresInDays).toBe(46)
  })

  it("keeps the most recent twelve doses, newest first", () => {
    const logs = Array.from({ length: 20 }, (_, index) =>
      log({
        id: `log-${index}`,
        scheduled_date: index < 10 ? "2026-11-20" : "2026-11-24",
        scheduled_time: index % 2 === 0 ? "08:00" : "20:00",
        status: index === 0 ? "skipped" : "taken",
        skip_reason: index === 0 ? "forgot" : null,
      }),
    )

    const context = buildMedicineContext({
      patient: { name: "Alex" },
      medicines: [medicine()],
      logs,
      todayIso: TODAY,
    })

    expect(context.recentDoses).toHaveLength(12)
    expect(context.recentDoses[0]?.date).toBe("2026-11-24")
    expect(context.totals).toEqual({ taken: 19, skipped: 1 })
  })

  it("names a dose whose medicine is no longer in the cabinet", () => {
    const context = buildMedicineContext({
      patient: { name: "Alex" },
      medicines: [],
      logs: [log({ medicine_id: "gone" })],
      todayIso: TODAY,
    })

    expect(context.recentDoses[0]?.medicine).toBe("a medicine")
  })
})
