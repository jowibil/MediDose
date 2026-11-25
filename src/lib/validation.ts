import {
  MAX_FREQUENCY,
  MAX_RESTOCK_QUANTITY,
  MAX_SKIP_NOTE_LENGTH,
  MIN_FREQUENCY,
  SKIP_REASON_OPTIONS,
  type DoseUnit,
  type ScheduleMode,
  type SkipReason,
} from "@/types/medicine"
import { isValidISODate, isValidTime, isPastDate } from "@/lib/dates"

export const MAX_ASSISTANT_QUESTION_LENGTH = 500

/** The assistant's only input is this question; validate before spending a call. */
export function validateAssistantQuestion(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return "Type a question first."
  if (trimmed.length > MAX_ASSISTANT_QUESTION_LENGTH) {
    return `Keep the question under ${MAX_ASSISTANT_QUESTION_LENGTH} characters.`
  }
  return null
}

export interface MedicineFormValues {
  name: string
  patientId: string
  /** When set, the server creates this patient instead of using patientId. */
  newPatientName: string
  dosageAmount: string
  dosageUnit: DoseUnit
  stock: string
  expirationDate: string
  frequencyPerDay: string
  firstDoseTime: string
  treatmentEndDate: string
  scheduleMode: ScheduleMode
  customTimes: string[]
}

export type MedicineFormErrors = Partial<Record<keyof MedicineFormValues, string>>

/**
 * Names allow letters, numbers, spaces, hyphens, apostrophes, and periods.
 * Reject symbols and numbers-only names.
 */
const VALID_NAME_REGEX = /^[a-zA-Z0-9\s'\-.]+$/
const NUMBERS_ONLY_REGEX = /^[\d\s'\-.]+$/

export function validateName(
  value: string,
  label: string,
): string | null {
  const trimmed = value.trim()
  if (!trimmed) return `Enter the ${label}.`
  if (!VALID_NAME_REGEX.test(trimmed)) {
    return `The ${label} can only contain letters, numbers, spaces, hyphens, periods, and apostrophes.`
  }
  if (NUMBERS_ONLY_REGEX.test(trimmed)) {
    return `The ${label} cannot contain only numbers. Please include letters.`
  }
  if (trimmed.length > 120) return `The ${label} must be 120 characters or fewer.`
  return null
}

/** Validates the add/edit medicine form. Returns field -> message. */
export function validateMedicineForm(
  values: MedicineFormValues,
  options: { todayIso?: string } = {},
): MedicineFormErrors {
  const todayIso = options.todayIso ?? "1970-01-01"
  const errors: MedicineFormErrors = {}

  const nameError = validateName(values.name, "medicine name")
  if (nameError) errors.name = nameError

  if (values.newPatientName.trim()) {
    const patientError = validateName(values.newPatientName, "patient name")
    if (patientError) errors.newPatientName = patientError
  } else if (!values.patientId.trim() || values.patientId === "__new__") {
    errors.patientId = "Choose a patient for this medicine."
  }

  const dosageAmount = Number(values.dosageAmount)
  if (!values.dosageAmount || Number.isNaN(dosageAmount) || dosageAmount <= 0) {
    errors.dosageAmount = "Enter a dosage amount greater than 0."
  }

  const stock = Number(values.stock)
  if (
    values.stock === "" ||
    Number.isNaN(stock) ||
    stock < 0 ||
    !Number.isInteger(stock)
  ) {
    errors.stock = "Enter a whole number of doses in stock (0 or more)."
  }

  if (!values.expirationDate) {
    errors.expirationDate = "Choose an expiration date."
  } else if (!isValidISODate(values.expirationDate)) {
    errors.expirationDate = "Enter a valid expiration date."
  } else if (isPastDate(values.expirationDate, todayIso)) {
    errors.expirationDate = "Expiration date can't be in the past."
  }

  const frequency = Number(values.frequencyPerDay)
  if (
    !values.frequencyPerDay ||
    Number.isNaN(frequency) ||
    !Number.isInteger(frequency) ||
    frequency < MIN_FREQUENCY ||
    frequency > MAX_FREQUENCY
  ) {
    errors.frequencyPerDay = `Frequency must be a whole number between ${MIN_FREQUENCY} and ${MAX_FREQUENCY}.`
  }

  if (values.scheduleMode !== "custom") {
    if (values.firstDoseTime && !isValidTime(values.firstDoseTime)) {
      errors.firstDoseTime = "Enter a valid time for the first dose."
    }
  }

  if (values.scheduleMode === "custom") {
    if (!values.customTimes || values.customTimes.length === 0) {
      errors.customTimes = "Add at least one time for custom schedules."
    } else if (!Number.isNaN(frequency) && values.customTimes.length !== frequency) {
      errors.customTimes = `Enter exactly ${frequency} custom time${frequency === 1 ? "" : "s"}.`
    } else if (values.customTimes.some((time) => !isValidTime(time))) {
      errors.customTimes = "All custom times must be valid HH:MM formats."
    }
  }

  if (values.treatmentEndDate) {
    if (!isValidISODate(values.treatmentEndDate)) {
      errors.treatmentEndDate = "Enter a valid treatment end date."
    } else if (isPastDate(values.treatmentEndDate, todayIso)) {
      errors.treatmentEndDate = "Treatment end date can't be in the past."
    }
  }

  return errors
}

export function hasErrors(errors: Record<string, string | undefined>): boolean {
  return Object.values(errors).some(Boolean)
}

export function isSkipReason(value: unknown): value is SkipReason {
  return SKIP_REASON_OPTIONS.some((option) => option.value === value)
}

/**
 * Validates a taken/skipped status change. Taken stores no reason/note;
 * skipped requires exactly one reason and an optional <=500 char note.
 */
export function validateSkipInput(
  reason: unknown,
  note: unknown,
): { ok: true; reason: SkipReason; note: string | null } | { ok: false; error: string } {
  if (!isSkipReason(reason)) {
    return { ok: false, error: "Choose why this dose was skipped." }
  }
  if (note !== null && note !== undefined && typeof note !== "string") {
    return { ok: false, error: "The note must be text." }
  }
  const trimmed = typeof note === "string" ? note.trim() : ""
  if (trimmed.length > MAX_SKIP_NOTE_LENGTH) {
    return {
      ok: false,
      error: `The note must be ${MAX_SKIP_NOTE_LENGTH} characters or fewer.`,
    }
  }
  return { ok: true, reason, note: trimmed.length > 0 ? trimmed : null }
}

/** Restock quantity must be a whole number between 1 and 10,000. */
export function validateRestockQuantity(value: string | number): string | null {
  const quantity = typeof value === "number" ? value : Number(value)
  if (
    value === "" ||
    Number.isNaN(quantity) ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > MAX_RESTOCK_QUANTITY
  ) {
    return `Enter a whole number between 1 and ${MAX_RESTOCK_QUANTITY.toLocaleString("en-US")}.`
  }
  return null
}

export function validatePatientName(value: string): string | null {
  return validateName(value, "patient name")
}

export function validateDisplayName(value: string): string | null {
  return validateName(value, "display name")
}

export function validateInviteCode(value: string): string | null {
  const normalized = value.replace(/[\s-]/g, "").toUpperCase()
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(normalized)) {
    return "That code isn’t valid. Check the six characters and try again."
  }
  return null
}

export function normalizeInviteCode(value: string): string {
  return value.replace(/[\s-]/g, "").toUpperCase()
}
