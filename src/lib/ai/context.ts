import type { DoseLogRow } from "@/lib/occurrences"
import type { HouseholdRole, Medicine } from "@/types/medicine"
import { daysUntil } from "@/lib/dates"
import { scheduleTimesForMedicine } from "@/lib/schedule"

/**
 * What the reader may do, per role. This is context for the answer, not an
 * authorisation check: RLS and the RPCs still decide what a request can do. It
 * lets the model answer "who can change this medicine?" without guessing.
 */
export const ROLE_CAPABILITIES: Record<HouseholdRole, string[]> = {
  owner: [
    "add, edit, archive, and dispose medicines",
    "add and rename patients and issue patient link codes",
    "invite and remove caregivers",
    "restock and correct stock",
    "log doses for anyone in the household",
    "generate and review weekly summaries",
  ],
  caregiver: [
    "log taken and skipped doses for patients in the household",
    "restock and correct stock",
    "generate and review weekly summaries",
    "cannot add or edit medicines, manage patients, or change the household",
  ],
  patient: [
    "see their own schedule and dose history",
    "mark their own doses taken or skipped",
    "cannot correct a dose, change a medicine, or see another patient",
    "ask the owner or a caregiver for anything else",
  ],
}

/** Who is reading, and how wide their view of the household is. */
export interface AssistantViewer {
  role: HouseholdRole
  /** Null for a patient account: the household is not theirs to see. */
  householdName: string | null
  /** Patients this account can see in this household; empty for a patient. */
  patients: string[]
}

/**
 * What the assistant is allowed to know: one patient's cabinet and their most
 * recent doses, plus what the reader's role may do. No ids, no emails, no other
 * patient's medicines — the caller passes the resolved active patient, and RLS
 * already limited those rows to it. A patient account gets no household roster.
 */
export interface AssistantContext {
  viewer: {
    role: HouseholdRole
    household: string | null
    peopleInHousehold: string[]
    can: string[]
  }
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
  viewer,
  patient,
  medicines,
  logs,
  todayIso,
}: {
  viewer: AssistantViewer
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
    viewer: {
      role: viewer.role,
      household: viewer.role === "patient" ? null : viewer.householdName,
      peopleInHousehold:
        viewer.role === "patient" ? [] : [...viewer.patients],
      can: ROLE_CAPABILITIES[viewer.role],
    },
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
