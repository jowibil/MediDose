import { describe, expect, it } from "vitest"

import { mergeOccurrences, type DoseLogRow } from "@/lib/occurrences"
import type { DoseOccurrence } from "@/types/medicine"

const occurrence: DoseOccurrence = {
  medicineId: "m1",
  patientId: "p1",
  scheduledDate: "2026-11-27",
  scheduledTime: "08:00",
  status: "pending",
}

// Postgres returns a `time` column with seconds: "08:00:00", not "08:00".
const log: DoseLogRow = {
  id: "log-1",
  medicine_id: "m1",
  patient_id: "p1",
  scheduled_date: "2026-11-27",
  scheduled_time: "08:00:00",
  status: "taken",
  skip_reason: null,
  skip_note: null,
  logged_by: "u1",
  logged_at: "2026-11-27T00:05:00Z",
  last_modified_by: null,
  updated_at: "2026-11-27T00:05:00Z",
}

describe("mergeOccurrences", () => {
  it("matches a HH:MM:SS log time to the HH:MM occurrence", () => {
    const merged = mergeOccurrences([occurrence], [log], new Map([["u1", "Ana"]]))

    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({
      status: "taken",
      logId: "log-1",
      loggedByName: "Ana",
    })
  })

  it("leaves an occurrence pending when no log matches it", () => {
    const merged = mergeOccurrences(
      [{ ...occurrence, scheduledTime: "20:00" }],
      [log],
      new Map(),
    )

    expect(merged[0]).toMatchObject({ status: "pending" })
    expect(merged[0].logId).toBeUndefined()
  })
})
