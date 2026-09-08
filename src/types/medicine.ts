export type DoseUnit = "mg" | "ml"

export type ExpirationStatus = "safe" | "expiring" | "expired"

export type ScheduleMode = "waking_hours" | "strict_interval" | "custom"

export interface Medicine {
  id: string
  /** Brand or generic name of the medicine */
  name: string
  /** Numeric dose amount, e.g. 500 */
  dosageAmount: number
  /** Unit the dose is measured in */
  dosageUnit: DoseUnit
  /** Number of doses currently in the cabinet */
  stock: number
  /** ISO date string (YYYY-MM-DD) the medicine expires */
  expirationDate: string
  /** How many times per day this medicine is taken, 1-6 */
  frequencyPerDay: number
  /** Who this medicine belongs to */
  patientName: string
  /** Optional custom start time for the daily schedule, "HH:MM" 24hr. Defaults to "08:00". */
  firstDoseTime?: string

  treatmentEndDate?: string

  scheduleMode?: ScheduleMode
  
  customTimes?: string[]
}

/** A single scheduled intake time generated from a medicine's frequency. */
export interface ScheduledDose {
  id: string
  medicineId: string
  /** ISO date string (YYYY-MM-DD) this dose falls on */
  date: string
  /** 24hr "HH:MM" time this dose is scheduled for */
  time: string
  taken: boolean
}

export const MIN_FREQUENCY = 1
export const MAX_FREQUENCY = 6
export const EXPIRING_SOON_THRESHOLD_DAYS = 30
