"use server"

import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import { requireSession, ownerHouseholdId, ACTIVE_PATIENT_COOKIE } from "@/lib/auth"
import { fail, mapDbError, ok, type ActionResult } from "@/lib/action-result"
import type { JoinResult } from "@/lib/form-results"
import {
  normalizeInviteCode,
  validateDisplayName,
  validateInviteCode,
} from "@/lib/validation"

export async function renameHouseholdAction(
  householdId: string,
  name: string,
): Promise<ActionResult> {
  const { context, error: authError } = await requireSession()
  if (!context) return fail(authError)
  if (ownerHouseholdId(context) !== householdId) {
    return fail("Only the household owner can rename the household.")
  }
  if (!name.trim()) return fail("Enter a household name.")

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase
    .from("households")
    .update({ name: name.trim() })
    .eq("id", householdId)

  if (error) return fail(mapDbError(error))
  revalidatePath("/settings")
  revalidatePath("/dashboard")
  revalidatePath("/medicines")
  return ok(null)
}

export async function regenerateInviteCodeAction(
  householdId: string,
): Promise<ActionResult<{ code: string }>> {
  const { context, error: authError } = await requireSession()
  if (!context) return fail(authError)
  if (ownerHouseholdId(context) !== householdId) {
    return fail("Only the household owner can regenerate the invite code.")
  }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc("regenerate_invite_code", {
    p_household_id: householdId,
  })

  if (error) return fail(mapDbError(error))
  revalidatePath("/settings")
  return ok({ code: String(data) })
}

export async function removeCaregiverAction(
  householdId: string,
  userId: string,
): Promise<ActionResult> {
  const { context, error: authError } = await requireSession()
  if (!context) return fail(authError)
  if (ownerHouseholdId(context) !== householdId) {
    return fail("Only the household owner can remove caregivers.")
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc("remove_caregiver", {
    p_household_id: householdId,
    p_user_id: userId,
  })

  if (error) return fail(mapDbError(error))
  revalidatePath("/settings")
  revalidatePath("/dashboard")
  return ok(null)
}

export async function updateProfileAction(
  displayName: string,
): Promise<ActionResult> {
  const { context, error: authError } = await requireSession()
  if (!context) return fail(authError)

  const nameError = validateDisplayName(displayName)
  if (nameError) return fail(nameError)

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: displayName.trim() })
    .eq("id", context.userId)

  if (error) return fail(mapDbError(error))
  revalidatePath("/settings")
  revalidatePath("/dashboard")
  return ok(null)
}

/**
 * Joins a household by invite code. Failures use one generic message so codes
 * cannot be enumerated; the RPC separately throttles five failures per hour.
 */
export async function joinHouseholdAction(code: string): Promise<JoinResult> {
  const { context, error: authError } = await requireSession()
  if (!context) return { ok: false, error: authError }

  const formatError = validateInviteCode(code)
  if (formatError) return { ok: false, error: formatError }

  const supabase = await createSupabaseServerClient()
  const { data: householdId, error } = await supabase.rpc("join_household", {
    p_code: normalizeInviteCode(code),
  })

  if (error) return { ok: false, error: mapDbError(error) }
  if (!householdId) {
    return {
      ok: false,
      error: mapDbError({ message: "INVALID_CODE" }),
    }
  }

  const { data: household } = await supabase
    .from("households")
    .select("name")
    .eq("id", householdId)
    .maybeSingle()

  const { data: firstPatient } = await supabase
    .from("patients")
    .select("id")
    .eq("household_id", householdId)
    .is("archived_at", null)
    .order("name", { ascending: true })
    .limit(1)
    .maybeSingle()

  if (firstPatient) {
    const cookieStore = await cookies()
    cookieStore.set(ACTIVE_PATIENT_COOKIE, firstPatient.id as string, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
    })
  }

  revalidatePath("/join")
  revalidatePath("/dashboard")
  revalidatePath("/medicines")
  revalidatePath("/history")

  return {
    ok: true,
    data: {
      householdName: (household?.name as string | undefined) ?? "the household",
    },
  }
}
