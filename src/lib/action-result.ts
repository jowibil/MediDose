export type ActionFailure = { ok: false; error: string }

export type ActionResult<T = null> = { ok: true; data: T } | ActionFailure

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data }
}

export function fail(error: string): ActionResult<never> {
  return { ok: false, error }
}

const ERROR_MESSAGES: Record<string, string> = {
  OUT_OF_STOCK:
    "No doses left. Restock or log this dose as skipped.",
  DOSE_ALREADY_LOGGED:
    "This dose is already logged. Refresh the page to see its status.",
  INVALID_CODE:
    "That code isn’t valid. Check the six characters and try again.",
  OWNER_CANNOT_JOIN:
    "This account manages its own household. Owners can’t join another household.",
  ARCHIVED: "This item is archived. Restore it before making changes.",
  NOT_OWNER: "Only the household owner can do that.",
  NOT_AUTHORIZED: "You don’t have access to that household.",
  AUTH_REQUIRED: "Please sign in again.",
  INVALID_QUANTITY: "Enter a whole number between 1 and 10,000.",
  INVALID_REASON: "Choose why this dose was skipped.",
  INVALID_STATUS: "Only Taken or Skipped can be recorded.",
  NOTE_TOO_LONG: "The note must be 500 characters or fewer.",
  OUT_OF_WINDOW: "That date isn’t within this medicine’s treatment window.",
  INVALID_TIME: "That time isn’t part of this medicine’s schedule.",
  PATIENT_MISMATCH: "That dose doesn’t belong to this patient.",
  ROLE_FIXED: "Account roles can’t be changed after signup.",
  NOT_ARCHIVED: "Archive this item before purging it.",
  NOT_CAREGIVER: "That account isn’t a caregiver in this household.",
  NOT_FOUND: "We couldn’t find that item.",
  EXPIRED_DATE: "Expiration date can’t be in the past.",
  INVALID_TREATMENT_END: "Treatment end date can’t be in the past.",
}

/** Failure copy for a missing session; see `requireSession()` in `src/lib/auth.ts`. */
export const AUTH_REQUIRED = ERROR_MESSAGES.AUTH_REQUIRED

/** Maps a Postgres error message/code from an RPC to friendly copy. */
export function mapDbError(error: { message?: string; code?: string } | null): string {
  const message = error?.message ?? ""

  for (const [code, friendly] of Object.entries(ERROR_MESSAGES)) {
    if (message.includes(code)) return friendly
  }

  if (error?.code === "23505") {
    return "That record already exists."
  }
  if (error?.code === "42501") {
    return "You don’t have permission to do that."
  }
  if (error?.code === "23514") {
    return "Some of those values aren’t valid. Check the form and try again."
  }

  return "Something went wrong. Please try again."
}
