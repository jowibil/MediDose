import type { ActionFailure, ActionResult } from "@/lib/action-result"
import type { MedicineFormErrors } from "@/lib/validation"

/** The success arm of `ActionResult`, without the generic failure member. */
type MedicineSaved = Extract<ActionResult<{ id: string }>, { ok: true }>

export type SaveMedicineResult =
  | MedicineSaved
  | (ActionFailure & { fieldErrors?: MedicineFormErrors })

export type AuthResult = ActionResult<{
  message?: string
  /** Server-chosen destination, e.g. the check-email route. */
  redirectTo?: string
}>

export type JoinResult = ActionResult<{ householdName: string }>
