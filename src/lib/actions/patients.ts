"use server"

import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import {
  canAccessPatient,
  getSessionContext,
  ownerHouseholdId,
  ACTIVE_PATIENT_COOKIE,
} from "@/lib/auth"
import { fail, mapDbError, ok, type ActionResult } from "@/lib/action-result"
import { validatePatientName } from "@/lib/validation"

function revalidatePatientViews(): void {
  revalidatePath("/dashboard")
  revalidatePath("/medicines")
  revalidatePath("/history")
  revalidatePath("/settings")
  revalidatePath("/join")
}

export async function createPatientAction(
  name: string,
): Promise<ActionResult<{ id: string }>> {
  const context = await getSessionContext()
  if (!context) return fail("Please sign in again.")

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
  revalidatePatientViews()
  return ok({ id: data.id as string })
}

export async function renamePatientAction(
  patientId: string,
  name: string,
): Promise<ActionResult> {
  const context = await getSessionContext()
  if (!context) return fail("Please sign in again.")
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
  revalidatePatientViews()
  return ok(null)
}

export async function archivePatientAction(
  patientId: string,
): Promise<ActionResult> {
  const context = await getSessionContext()
  if (!context) return fail("Please sign in again.")
  const householdId = ownerHouseholdId(context)
  if (!householdId) return fail("Only the household owner can archive patients.")

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase
    .from("patients")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", patientId)
    .eq("household_id", householdId)

  if (error) return fail(mapDbError(error))
  revalidatePatientViews()
  return ok(null)
}

export async function restorePatientAction(
  patientId: string,
): Promise<ActionResult> {
  const context = await getSessionContext()
  if (!context) return fail("Please sign in again.")
  const householdId = ownerHouseholdId(context)
  if (!householdId) return fail("Only the household owner can restore patients.")

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase
    .from("patients")
    .update({ archived_at: null })
    .eq("id", patientId)
    .eq("household_id", householdId)

  if (error) return fail(mapDbError(error))
  revalidatePatientViews()
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
  revalidatePatientViews()
  return ok(null)
}

/** Sets the httpOnly active-patient cookie after re-validating access. */
export async function setActivePatientAction(
  patientId: string,
): Promise<ActionResult> {
  const context = await getSessionContext()
  if (!context) return fail("Please sign in again.")
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

  revalidatePatientViews()
  return ok(null)
}
