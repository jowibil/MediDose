// src/lib/validation.ts
import { MAX_FREQUENCY, MIN_FREQUENCY, type DoseUnit, type ScheduleMode } from "@/types/medicine";
import { isPastDate } from "@/lib/dates";

export interface MedicineFormValues {
  name: string;
  dosageAmount: string;
  dosageUnit: DoseUnit;
  stock: string;
  expirationDate: string;
  frequencyPerDay: string;
  patientName: string;
  firstDoseTime: string;
  treatmentEndDate: string;
  scheduleMode: ScheduleMode;
  customTimes: string[];
}

export type MedicineFormErrors = Partial<
  Record<keyof MedicineFormValues, string>
>;

/**
 * Regex for valid names:
 * Allows letters (Unicode/accented characters), numbers, spaces, hyphens, apostrophes, and periods.
 * Disallows symbols and special characters like @, #, $, %, <, >, /, etc.
 */
const VALID_NAME_REGEX = /^[a-zA-Z0-9\s'\-\.]+$/;

/** Regex to check if a string contains ONLY numbers and spaces/punctuation (no letters) */
const NUMBERS_ONLY_REGEX = /^[\d\s'\-\.]+$/;

/** Validates a new-medicine form. Returns a map of field -> error message. */
export function validateMedicineForm(
  values: MedicineFormValues,
): MedicineFormErrors {
  const errors: MedicineFormErrors = {};

  // 1. Medicine Name Validation
  const trimmedName = values.name.trim();
  if (!trimmedName) {
    errors.name = "Enter the medicine's brand or generic name.";
  } else if (!VALID_NAME_REGEX.test(trimmedName)) {
    errors.name = "Medicine name can only contain letters, numbers, spaces, hyphens, periods, and apostrophes.";
  } else if (NUMBERS_ONLY_REGEX.test(trimmedName)) {
    errors.name = "Medicine name cannot contain only numbers. Please include letters.";
  }

  // 2. Patient Name Validation
  const trimmedPatient = values.patientName.trim();
  if (!trimmedPatient) {
    errors.patientName = "Enter who this medicine is for.";
  } else if (!VALID_NAME_REGEX.test(trimmedPatient)) {
    errors.patientName = "Patient name can only contain letters, numbers, spaces, hyphens, periods, and apostrophes.";
  } else if (NUMBERS_ONLY_REGEX.test(trimmedPatient)) {
    errors.patientName = "Patient name cannot contain only numbers. Please include letters.";
  }

  const dosageAmount = Number(values.dosageAmount);
  if (!values.dosageAmount || Number.isNaN(dosageAmount) || dosageAmount <= 0) {
    errors.dosageAmount = "Enter a dosage amount greater than 0.";
  }

  const stock = Number(values.stock);
  if (
    values.stock === "" ||
    Number.isNaN(stock) ||
    stock < 0 ||
    !Number.isInteger(stock)
  ) {
    errors.stock = "Enter a whole number of doses in stock (0 or more).";
  }

  if (!values.expirationDate) {
    errors.expirationDate = "Choose an expiration date.";
  } else if (isPastDate(values.expirationDate)) {
    errors.expirationDate = "Expiration date can't be in the past.";
  }

  const frequency = Number(values.frequencyPerDay);
  if (
    !values.frequencyPerDay ||
    Number.isNaN(frequency) ||
    !Number.isInteger(frequency) ||
    frequency < MIN_FREQUENCY ||
    frequency > MAX_FREQUENCY
  ) {
    errors.frequencyPerDay = `Frequency must be a whole number between ${MIN_FREQUENCY} and ${MAX_FREQUENCY}.`;
  }

  if (values.scheduleMode !== "custom") {
    if (
      values.firstDoseTime &&
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(values.firstDoseTime)
    ) {
      errors.firstDoseTime = "Enter a valid time for the first dose.";
    }
  }

  if (values.scheduleMode === "custom") {
    if (!values.customTimes || values.customTimes.length === 0) {
      errors.customTimes = "Add at least one time for custom schedules.";
    } else {
      const invalidTime = values.customTimes.some(
        (t) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(t)
      );
      if (invalidTime) {
        errors.customTimes = "All custom times must be valid HH:MM formats.";
      }
    }
  }

  if (values.treatmentEndDate) {
    if (isPastDate(values.treatmentEndDate)) {
      errors.treatmentEndDate = "Treatment end date can't be in the past.";
    }
  }

  return errors;
}

export function hasErrors(errors: MedicineFormErrors): boolean {
  return Object.keys(errors).length > 0;
}