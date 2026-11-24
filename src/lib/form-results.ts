import type { MedicineFormErrors } from "@/lib/validation"

export type SaveMedicineResult =
  | { ok: true; data: { id: string } }
  | { ok: false; error: string; fieldErrors?: MedicineFormErrors }

export type AuthResult =
  | {
      ok: true
      data: {
        message?: string
        /** Server-chosen destination, e.g. the check-email route. */
        redirectTo?: string
      }
    }
  | { ok: false; error: string }

export type JoinResult =
  | { ok: true; data: { householdName: string } }
  | { ok: false; error: string }
