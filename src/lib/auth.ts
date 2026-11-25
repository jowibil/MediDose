import { cache } from "react"
import { cookies } from "next/headers"

import type {
  HouseholdGroup,
  HouseholdRole,
  PatientState,
  SessionContext,
} from "@/types/medicine"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { AUTH_REQUIRED } from "@/lib/action-result"

interface MembershipRow {
  household_id: string
  role: HouseholdRole
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

  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("household_members")
      .select("household_id, role, households ( id, name )")
      .eq("user_id", user.id),
  ])

  const membershipRows = (memberships ?? []) as unknown as MembershipRow[]
  const isPatient = membershipRows.some((row) => row.role === "patient")

  // Staff read the active cabinet only. A patient must also see their own
  // archived record, or an archived account would be indistinguishable from a
  // never-linked one.
  const patientQuery = supabase
    .from("patients")
    .select("id, household_id, name, archived_at")
    .order("name", { ascending: true })
  const { data: patients } = isPatient
    ? await patientQuery
    : await patientQuery.is("archived_at", null)

  const patientRows = patients ?? []

  const groups: HouseholdGroup[] = membershipRows
    .map((membership) => {
      const household = householdFrom(membership)
      if (!household) return null
      return {
        householdId: household.id,
        householdName: household.name,
        role: membership.role,
        patients: patientRows
          .filter((patient) => patient.household_id === household.id)
          .map((patient) => ({ id: patient.id, name: patient.name }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      } satisfies HouseholdGroup
    })
    .filter((group): group is HouseholdGroup => group !== null)
    .sort((a, b) => a.householdName.localeCompare(b.householdName))

  // The membership is the authoritative role; "owner if any, else caregiver"
  // stopped being true the moment a third role existed.
  const membershipRole: HouseholdRole = isPatient
    ? "patient"
    : groups.some((group) => group.role === "owner")
      ? "owner"
      : "caregiver"

  // Signup writes account_type into user metadata. It only routes the UI (an
  // unclaimed or unlinked patient must still reach /join after a refresh);
  // every permission decision lives in RLS and the RPCs.
  const metadataRole = user.user_metadata?.account_type
  const accountType: HouseholdRole =
    metadataRole === "owner" ||
    metadataRole === "caregiver" ||
    metadataRole === "patient"
      ? metadataRole
      : membershipRole

  // A patient account stays "patient" after an unlink or purge: the membership
  // is gone, but the account must see the link-code form, not caregiver nav.
  const role: HouseholdRole =
    accountType === "patient" ? "patient" : membershipRole

  // patients_select already limits a patient account to its own row, so the
  // first row is theirs. Staff never set this, whatever their patient list holds.
  const selfPatientId = isPatient ? (patientRows[0]?.id ?? null) : null
  const patientState: PatientState | null =
    role === "patient"
      ? selfPatientId === null
        ? "not_linked"
        : patientRows[0]?.archived_at
          ? "archived"
          : "active"
      : null

  return {
    userId: user.id,
    displayName: profile?.display_name ?? user.email ?? "MediDose user",
    email: user.email ?? "",
    role,
    accountType,
    households: groups,
    selfPatientId,
    patientState,
  }
})

export const ACTIVE_PATIENT_COOKIE = "md_active_patient"

export interface ActivePatient {
  id: string
  name: string
  householdId: string
  householdName: string
  role: HouseholdRole
}

/**
 * Resolves the patient scoping every page. The cookie must name a patient the
 * user can currently access; otherwise we fall back to the first active
 * patient ordered by household then patient name.
 */
export async function resolveActivePatient(
  context: SessionContext,
): Promise<ActivePatient | null> {
  const all: ActivePatient[] = context.households.flatMap((group) =>
    group.patients.map((patient) => ({
      id: patient.id,
      name: patient.name,
      householdId: group.householdId,
      householdName: group.householdName,
      role: group.role,
    })),
  )

  // A patient account has one record and no switcher: the cookie is never
  // consulted, so a stale or hand-set value cannot widen scope. An archived
  // record resolves to null and the dashboard shows the archived state.
  if (context.role === "patient") {
    if (context.patientState !== "active") return null
    return all[0] ?? null
  }

  const cookieStore = await cookies()
  const stored = cookieStore.get(ACTIVE_PATIENT_COOKIE)?.value

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
  if (context.role === "patient") return context.selfPatientId === patientId
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

/**
 * Session context for an action only staff may run. A patient account passes
 * `can_view_patient` for its own record, so every staff-only action has to say
 * so explicitly rather than relying on RLS.
 */
export async function requireStaff(): Promise<RequiredSession> {
  const session = await requireSession()
  if (!session.context) return session
  if (session.context.role === "patient") {
    return {
      context: null,
      error: "Only a household owner or caregiver can do that.",
    }
  }
  return session
}
