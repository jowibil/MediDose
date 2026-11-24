export type DoseUnit = "mg" | "ml"

export type ExpirationStatus = "safe" | "expiring" | "expired"

export type ScheduleMode = "waking_hours" | "strict_interval" | "custom"

/** The four quick-select reasons a dose can be skipped. Exactly one is stored. */
export type SkipReason =
  | "forgot"
  | "out_of_stock"
  | "felt_unwell"
  | "doctor_advised"

/** Persisted logs are taken/skipped only; pending is derived from the schedule. */
export type DoseLogStatus = "taken" | "skipped"
export type DoseStatus = "pending" | DoseLogStatus

export interface Patient {
  id: string
  householdId: string
  name: string
  archivedAt: string | null
  createdAt: string
}

export interface Medicine {
  id: string
  patientId: string
  name: string
  dosageAmount: number
  dosageUnit: DoseUnit
  /** Doses currently in the cabinet (not tablets). */
  stock: number
  /** ISO date (YYYY-MM-DD) the medicine expires. */
  expirationDate: string
  /** How many times per day this medicine is taken, 1-6. */
  frequencyPerDay: number
  scheduleMode: ScheduleMode
  firstDoseTime: string
  customTimes: string[] | null
  /** Authoritative daily slots, computed by the scheduler and stored on save. */
  scheduleTimes: string[]
  treatmentEndDate: string | null
  archivedAt: string | null
  /** Date the medicine was archived; history is readable through this day. */
  archivedDate: string | null
  /** Local creation date used as the first day of the schedule, YYYY-MM-DD. */
  createdDate: string
  createdAt: string
}

/** One scheduled intake, derived from a medicine's schedule. */
export interface DoseOccurrence {
  medicineId: string
  patientId: string
  scheduledDate: string
  scheduledTime: string
  status: DoseStatus
  logId?: string
  skipReason?: SkipReason
  skipNote?: string
  loggedByName?: string
  loggedAt?: string
  lastModifiedByName?: string
}

export interface DoseLog {
  id: string
  medicineId: string
  patientId: string
  scheduledDate: string
  scheduledTime: string
  status: DoseLogStatus
  skipReason: SkipReason | null
  skipNote: string | null
  loggedBy: string | null
  loggedAt: string
  lastModifiedBy: string | null
  updatedAt: string
}

export interface PatientOption {
  id: string
  name: string
}

export interface HouseholdGroup {
  householdId: string
  householdName: string
  role: "owner" | "caregiver"
  patients: PatientOption[]
}

export interface SessionContext {
  userId: string
  displayName: string
  email: string
  role: "owner" | "caregiver"
  households: HouseholdGroup[]
}

export const MIN_FREQUENCY = 1
export const MAX_FREQUENCY = 6
export const EXPIRING_SOON_THRESHOLD_DAYS = 30
export const MAX_SKIP_NOTE_LENGTH = 500
export const MAX_RESTOCK_QUANTITY = 10_000

export const SKIP_REASON_OPTIONS: { value: SkipReason; label: string }[] = [
  { value: "forgot", label: "Forgot" },
  { value: "out_of_stock", label: "Out of stock" },
  { value: "felt_unwell", label: "Felt unwell" },
  { value: "doctor_advised", label: "Doctor advised" },
]

export function skipReasonLabel(reason: SkipReason | null | undefined): string {
  return SKIP_REASON_OPTIONS.find((option) => option.value === reason)?.label ?? "Skipped"
}
