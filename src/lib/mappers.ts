import type {
  DoseLogStatus,
  DoseUnit,
  Medicine,
  Patient,
  ScheduleMode,
  SkipReason,
} from "@/types/medicine"
import type { Tables } from "@/types/database.types"
import { normalizeTime } from "@/lib/dates"

export function toPatient(row: Tables<"patients">): Patient {
  return {
    id: row.id,
    householdId: row.household_id,
    name: row.name,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
  }
}

export function toMedicine(row: Tables<"medicines">): Medicine {
  return {
    id: row.id,
    patientId: row.patient_id,
    name: row.name,
    dosageAmount: Number(row.dosage_amount),
    dosageUnit: row.dosage_unit as DoseUnit,
    stock: row.stock_on_hand,
    expirationDate: row.expiration_date,
    frequencyPerDay: row.frequency_per_day,
    scheduleMode: row.schedule_mode as ScheduleMode,
    firstDoseTime: normalizeTime(row.first_dose_time),
    customTimes: row.custom_times
      ? row.custom_times.map((time) => normalizeTime(time))
      : null,
    scheduleTimes: (row.schedule_times ?? []).map((time) => normalizeTime(time)),
    treatmentEndDate: row.treatment_end_date,
    archivedAt: row.archived_at,
    archivedDate: row.archived_at ? row.archived_at.slice(0, 10) : null,
    createdDate: row.created_at.slice(0, 10),
    createdAt: row.created_at,
  }
}

export interface DoseLogRow {
  id: string
  medicine_id: string
  patient_id: string
  scheduled_date: string
  scheduled_time: string
  status: DoseLogStatus
  skip_reason: SkipReason | null
  skip_note: string | null
  logged_by: string | null
  logged_at: string
  last_modified_by: string | null
  updated_at: string
}

/** Formats a numeric dosage without floating noise (500, 2.5). */
export function formatDosage(amount: number, unit: DoseUnit): string {
  return `${Number.isInteger(amount) ? amount : amount.toFixed(2)}${unit}`
}
