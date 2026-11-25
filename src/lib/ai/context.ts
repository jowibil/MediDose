import type { DoseLogRow } from "@/lib/occurrences"
import type { Medicine } from "@/types/medicine"
import { daysUntil } from "@/lib/dates"
import { scheduleTimesForMedicine } from "@/lib/schedule"

/**
 * What the assistant is allowed to know: one patient's cabinet and their most
 * recent doses. No ids, no emails, no other patient — the caller passes the
 * resolved active patient, and RLS already limited those rows to it.
 */
export interface AssistantContext {
  person: string
  today: string
  medicines: {
    name: string
    dosage: string
    stock: number
    schedule: string
    expiresInDays: number
    treatmentEndsOn: string | null
  }[]
  recentDoses: {
    date: string
    time: string
    medicine: string
    status: "taken" | "skipped"
    reason: string | null
  }[]
  totals: { taken: number; skipped: number }
}

const RECENT_DOSE_LIMIT = 12

export function buildMedicineContext({
  patient,
  medicines,
  logs,
  todayIso,
}: {
  patient: { name: string }
  medicines: Medicine[]
  logs: DoseLogRow[]
  todayIso: string
}): AssistantContext {
  const nameById = new Map(medicines.map((medicine) => [medicine.id, medicine.name]))

  const recentDoses = [...logs]
    .sort(
      (a, b) =>
        b.scheduled_date.localeCompare(a.scheduled_date) ||
        b.scheduled_time.localeCompare(a.scheduled_time),
    )
    .slice(0, RECENT_DOSE_LIMIT)
    .map((log) => ({
      date: log.scheduled_date,
      time: log.scheduled_time,
      medicine: nameById.get(log.medicine_id) ?? "a medicine",
      status: log.status,
      reason: log.skip_reason,
    }))

  return {
    person: patient.name,
    today: todayIso,
    medicines: medicines
      .filter((medicine) => !medicine.archivedAt)
      .map((medicine) => ({
        name: medicine.name,
        dosage: `${medicine.dosageAmount}${medicine.dosageUnit}`,
        stock: medicine.stock,
        schedule: scheduleTimesForMedicine(medicine).join(", "),
        expiresInDays: daysUntil(medicine.expirationDate, todayIso),
        treatmentEndsOn: medicine.treatmentEndDate,
      })),
    recentDoses,
    totals: {
      taken: logs.filter((log) => log.status === "taken").length,
      skipped: logs.filter((log) => log.status === "skipped").length,
    },
  }
}

/** The record as the model sees it. Names are data, never instructions. */
export function serializeContext(context: AssistantContext): string {
  return JSON.stringify(context, null, 2)
}
