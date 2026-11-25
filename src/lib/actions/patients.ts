"use server"

import { cookies } from "next/headers"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import {
  canAccessPatient,
  ownerHouseholdId,
  requireSession,
  ACTIVE_PATIENT_COOKIE,
} from "@/lib/auth"
import { revalidateViews } from "@/lib/revalidate"
import { fail, mapDbError, ok, type ActionResult } from "@/lib/action-result"
import {
  normalizeInviteCode,
  validateInviteCode,
  validatePatientName,
} from "@/lib/validation"

export async function createPatientAction(
  name: string,
): Promise<ActionResult<{ id: string }>> {
  const { context, error: authError } = await requireSession()
  if (!context) return fail(authError)

  const householdId = ownerHouseholdId(context)
  if (!householdId) return fail("Only the household owner can add patients.")

  const nameError = validatePatientName(name)
  if (nameError) return fail(nameError)

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from("patients")
    .insert({ household_id: householdId, name: name.trim() })
    .select("id")
    .single()

  if (error) return fail(mapDbError(error))
  revalidateViews("patient")
  return ok({ id: data.id as string })
}

export async function renamePatientAction(
  patientId: string,
  name: string,
): Promise<ActionResult> {
  const { context, error: authError } = await requireSession()
  if (!context) return fail(authError)
  const householdId = ownerHouseholdId(context)
  if (!householdId) return fail("Only the household owner can rename patients.")

  const nameError = validatePatientName(name)
  if (nameError) return fail(nameError)

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase
    .from("patients")
    .update({ name: name.trim() })
    .eq("id", patientId)
    .eq("household_id", householdId)

  if (error) return fail(mapDbError(error))
  revalidateViews("patient")
  return ok(null)
}

export async function archivePatientAction(
  patientId: string,
): Promise<ActionResult> {
  const { context, error: authError } = await requireSession()
  if (!context) return fail(authError)
  const householdId = ownerHouseholdId(context)
  if (!householdId) return fail("Only the household owner can archive patients.")

  // Goes through the RPC because the same statement must clear link_code, which
  // is outside the column-level UPDATE grant (20261125000800).
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc("archive_patient", {
    p_patient_id: patientId,
  })

  if (error) return fail(mapDbError(error))
  revalidateViews("patient")
  return ok(null)
}

export async function restorePatientAction(
  patientId: string,
): Promise<ActionResult> {
  const { context, error: authError } = await requireSession()
  if (!context) return fail(authError)
  const householdId = ownerHouseholdId(context)
  if (!householdId) return fail("Only the household owner can restore patients.")

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase
    .from("patients")
    .update({ archived_at: null })
    .eq("id", patientId)
    .eq("household_id", householdId)

  if (error) return fail(mapDbError(error))
  revalidateViews("patient")
  return ok(null)
}

export async function purgePatientAction(
  patientId: string,
): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc("purge_patient", {
    p_patient_id: patientId,
  })
  if (error) return fail(mapDbError(error))
  revalidateViews("patient")
  return ok(null)
}

/**
 * Redeems a patient link code as the signed-in account. The RPC is the
 * authority: it refuses a caller who already holds another role, refuses an
 * archived or already-claimed record, and applies the same throttle as
 * join_household. Failures share one message so codes cannot be probed.
 */
export async function claimPatientAction(
  code: string,
): Promise<ActionResult<{ householdName: string }>> {
  const { context, error: authError } = await requireSession()
  if (!context) return fail(authError)
  if (context.accountType !== "patient") {
    return fail(mapDbError({ message: "NOT_A_PATIENT_ACCOUNT" }))
  }

  const formatError = validateInviteCode(code)
  if (formatError) return fail(formatError)

  const supabase = await createSupabaseServerClient()
  const { data: householdId, error } = await supabase.rpc("claim_patient", {
    p_code: normalizeInviteCode(code),
  })

  if (error) return fail(mapDbError(error))
  if (!householdId) return fail(mapDbError({ message: "INVALID_CODE" }))

  const { data: household } = await supabase
    .from("households")
    .select("name")
    .eq("id", householdId)
    .maybeSingle()

  revalidateViews("patient")
  return ok({
    householdName: (household?.name as string | undefined) ?? "the household",
  })
}

/** Owner only. Mints (or replaces) a patient's link code and returns it once. */
export async function generatePatientLinkCodeAction(
  patientId: string,
): Promise<ActionResult<{ code: string }>> {
  const { context, error: authError } = await requireSession()
  if (!context) return fail(authError)
  if (!ownerHouseholdId(context)) {
    return fail("Only the household owner can create link codes.")
  }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc("set_patient_link_code", {
    p_patient_id: patientId,
  })

  if (error) return fail(mapDbError(error))
  revalidateViews("patient")
  return ok({ code: String(data) })
}

/** Owner only. Detaches the account and deletes the patient membership. */
export async function unlinkPatientAction(
  patientId: string,
): Promise<ActionResult> {
  const { context, error: authError } = await requireSession()
  if (!context) return fail(authError)
  if (!ownerHouseholdId(context)) {
    return fail("Only the household owner can unlink patients.")
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc("unlink_patient", {
    p_patient_id: patientId,
  })

  if (error) return fail(mapDbError(error))
  revalidateViews("patient")
  return ok(null)
}

/** Sets the httpOnly active-patient cookie after re-validating access. */
export async function setActivePatientAction(
  patientId: string,
): Promise<ActionResult> {
  const { context, error: authError } = await requireSession()
  if (!context) return fail(authError)
  if (!canAccessPatient(context, patientId)) {
    return fail("You don’t have access to that patient.")
  }

  const cookieStore = await cookies()
  cookieStore.set(ACTIVE_PATIENT_COOKIE, patientId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  })

  revalidateViews("patient")
  return ok(null)
}
