import { cache } from "react"
import { cookies } from "next/headers"

import type { HouseholdGroup, SessionContext } from "@/types/medicine"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { AUTH_REQUIRED } from "@/lib/action-result"

interface MembershipRow {
  household_id: string
  role: "owner" | "caregiver"
  households: { id: string; name: string } | { id: string; name: string }[] | null
}

function householdFrom(membership: MembershipRow): { id: string; name: string } | null {
  const value = membership.households
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

/**
 * Loads the signed-in user's profile, households, and accessible patients.
 * Cached per request so layouts, pages, and actions share one lookup.
 */
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const [{ data: profile }, { data: memberships }, { data: patients }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("household_members")
        .select("household_id, role, households ( id, name )")
        .eq("user_id", user.id),
      supabase
        .from("patients")
        .select("id, household_id, name")
        .is("archived_at", null)
        .order("name", { ascending: true }),
    ])

  const groups: HouseholdGroup[] = (memberships ?? [])
    .map((membership) => {
      const row = membership as unknown as MembershipRow
      const household = householdFrom(row)
      if (!household) return null
      return {
        householdId: household.id,
        householdName: household.name,
        role: row.role,
        patients: (patients ?? [])
          .filter((patient) => patient.household_id === household.id)
          .map((patient) => ({ id: patient.id, name: patient.name }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      } satisfies HouseholdGroup
    })
    .filter((group): group is HouseholdGroup => group !== null)
    .sort((a, b) => a.householdName.localeCompare(b.householdName))

  const role = groups.some((group) => group.role === "owner")
    ? "owner"
    : "caregiver"

  return {
    userId: user.id,
    displayName: profile?.display_name ?? user.email ?? "MediDose user",
    email: user.email ?? "",
    role,
    households: groups,
  }
})

export const ACTIVE_PATIENT_COOKIE = "md_active_patient"

export interface ActivePatient {
  id: string
  name: string
  householdId: string
  householdName: string
  role: "owner" | "caregiver"
}

/**
 * Resolves the patient scoping every page. The cookie must name a patient the
 * user can currently access; otherwise we fall back to the first active
 * patient ordered by household then patient name.
 */
export async function resolveActivePatient(
  context: SessionContext,
): Promise<ActivePatient | null> {
  const cookieStore = await cookies()
  const stored = cookieStore.get(ACTIVE_PATIENT_COOKIE)?.value

  const all: ActivePatient[] = context.households.flatMap((group) =>
    group.patients.map((patient) => ({
      id: patient.id,
      name: patient.name,
      householdId: group.householdId,
      householdName: group.householdName,
      role: group.role,
    })),
  )

  if (stored) {
    const match = all.find((patient) => patient.id === stored)
    if (match) return match
  }

  return all[0] ?? null
}

export function ownerHouseholdId(context: SessionContext): string | null {
  return (
    context.households.find((group) => group.role === "owner")?.householdId ??
    null
  )
}

export function canAccessPatient(
  context: SessionContext,
  patientId: string,
): boolean {
  return context.households.some((group) =>
    group.patients.some((patient) => patient.id === patientId),
  )
}

export type RequiredSession =
  | { context: SessionContext; error: null }
  | { context: null; error: string }

/**
 * Session context for a server action, or the standard signed-out failure.
 * The copy lives in `action-result.ts` so every action answers a missing
 * session the same way.
 */
export async function requireSession(): Promise<RequiredSession> {
  const context = await getSessionContext()
  return context
    ? { context, error: null }
    : { context: null, error: AUTH_REQUIRED }
}
