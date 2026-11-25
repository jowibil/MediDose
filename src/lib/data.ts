import { createSupabaseServerClient } from "@/lib/supabase/server"
import { toMedicine, toPatient } from "@/lib/mappers"
import type { Medicine, Patient } from "@/types/medicine"
import type { DoseLogRow } from "@/lib/occurrences"

/**
 * `*` needs a table-level SELECT grant; public.patients has column grants only
 * (link_code and user_id are owner-only through RPCs). List what the UI reads.
 */
const PATIENT_COLUMNS = "id, household_id, name, archived_at, created_at"

/**
 * Medicines for one patient, ordered by name. `includeArchived` keeps past
 * dose history readable. Household scoping is intentionally left to RLS: the
 * policies already restrict rows to households the caller belongs to.
 */
export async function getMedicines(
  patientId: string,
  includeArchived = false,
): Promise<Medicine[]> {
  const supabase = await createSupabaseServerClient()
  const base = supabase.from("medicines").select("*").eq("patient_id", patientId)

  const { data } = await (includeArchived ? base : base.is("archived_at", null))
    .order("name", { ascending: true })

  return (data ?? []).map((row) => toMedicine(row))
}

export interface HouseholdMedicine extends Medicine {
  patientName: string
}

/**
 * Every active medicine across the household, each tagged with its patient.
 * The pharmacy list is one trip for the whole household, so it is the one
 * medicine query that is not scoped to a single patient. Archived patients are
 * excluded: their medicines are not going on a shopping list.
 */
export async function getHouseholdMedicines(
  householdId: string,
): Promise<HouseholdMedicine[]> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from("medicines")
    .select("*, patients!inner(name, household_id, archived_at)")
    .eq("patients.household_id", householdId)
    .is("patients.archived_at", null)
    .is("archived_at", null)
    .order("name", { ascending: true })

  return (data ?? []).map((row) => ({
    ...toMedicine(row),
    patientName: row.patients?.name ?? "",
  }))
}

/** Active plus archived medicines, used to keep past dose history readable. */
export function getMedicinesIncludingArchived(
  patientId: string,
): Promise<Medicine[]> {
  return getMedicines(patientId, true)
}

export async function getMedicineById(id: string): Promise<Medicine | null> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from("medicines")
    .select("*")
    .eq("id", id)
    .maybeSingle()
  return data ? toMedicine(data) : null
}

export async function getArchivedMedicines(
  householdId: string,
): Promise<Medicine[]> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from("medicines")
    .select("*, patients!inner(household_id)")
    .eq("patients.household_id", householdId)
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false })
  return (data ?? []).map((row) => toMedicine(row))
}

export async function getArchivedPatients(
  householdId: string,
): Promise<Patient[]> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from("patients")
    .select(PATIENT_COLUMNS)
    .eq("household_id", householdId)
    .not("archived_at", "is", null)
    .order("name", { ascending: true })
  return (data ?? []).map((row) => toPatient(row))
}

export async function getDoseLogs(
  medicineIds: string[],
  startIso: string,
  endIso: string,
): Promise<DoseLogRow[]> {
  if (medicineIds.length === 0) return []
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from("dose_logs")
    .select("*")
    .in("medicine_id", medicineIds)
    .gte("scheduled_date", startIso)
    .lte("scheduled_date", endIso)
  return (data ?? []) as DoseLogRow[]
}

/** Display names for a set of profile ids (loggers and stock actors). */
export async function getDisplayNames(
  ids: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const unique = Array.from(
    new Set(ids.filter((id): id is string => Boolean(id))),
  )
  if (unique.length === 0) return new Map()

  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", unique)

  return new Map((data ?? []).map((row) => [row.id, row.display_name]))
}

export interface StockMovement {
  id: string
  medicineId: string
  medicineName: string
  delta: number
  reason:
    | "initial"
    | "dose_taken"
    | "dose_reverted"
    | "restock"
    | "owner_edit"
  actorName: string | null
  createdAt: string
}

export async function getStockMovements(
  medicines: Medicine[],
  limit = 20,
): Promise<StockMovement[]> {
  if (medicines.length === 0) return []

  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from("stock_adjustments")
    .select("*")
    .in(
      "medicine_id",
      medicines.map((medicine) => medicine.id),
    )
    .order("created_at", { ascending: false })
    .limit(limit)

  const rows = (data ?? []) as {
    id: string
    medicine_id: string
    delta: number
    reason: StockMovement["reason"]
    actor: string | null
    created_at: string
  }[]

  const names = await getDisplayNames(rows.map((row) => row.actor))
  const medicineNames = new Map(
    medicines.map((medicine) => [medicine.id, medicine.name]),
  )

  return rows.map((row) => ({
    id: row.id,
    medicineId: row.medicine_id,
    medicineName: medicineNames.get(row.medicine_id) ?? "Medicine",
    delta: row.delta,
    reason: row.reason,
    actorName: row.actor ? (names.get(row.actor) ?? "Unknown") : null,
    createdAt: row.created_at,
  }))
}

export interface CaregiverRow {
  userId: string
  displayName: string
  joinedAt: string
}

export async function getCaregivers(
  householdId: string,
): Promise<CaregiverRow[]> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from("household_members")
    .select("user_id, created_at, role")
    .eq("household_id", householdId)
    .eq("role", "caregiver")
    .order("created_at", { ascending: true })

  const rows = (data ?? []) as {
    user_id: string
    created_at: string
  }[]

  const names = await getDisplayNames(rows.map((row) => row.user_id))

  return rows.map((row) => ({
    userId: row.user_id,
    displayName: names.get(row.user_id) ?? "Caregiver",
    joinedAt: row.created_at,
  }))
}

export async function getInviteCode(householdId: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc("get_invite_code", {
    p_household_id: householdId,
  })
  if (error) return null
  return typeof data === "string" ? data : null
}

export type PatientLinkStatus = "linked" | "code" | "none"

export interface PatientLinkInfo {
  status: PatientLinkStatus
  code: string | null
}

/**
 * Owner-only link state for one patient, read through RPCs because
 * patients.user_id and patients.link_code are outside the column grant.
 */
export async function getPatientLinkInfo(
  patientId: string,
): Promise<PatientLinkInfo> {
  const supabase = await createSupabaseServerClient()
  const { data: status } = await supabase.rpc("patient_link_status", {
    p_patient_id: patientId,
  })
  const value: PatientLinkStatus =
    status === "linked" || status === "code" ? status : "none"

  if (value !== "code") return { status: value, code: null }

  const { data: code } = await supabase.rpc("get_patient_link_code", {
    p_patient_id: patientId,
  })
  return { status: value, code: typeof code === "string" ? code : null }
}

export interface WeekPlanInfo {
  weekStart: string
  timezone: string
}

export async function getWeekPlan(
  patientId: string,
  weekStart: string,
): Promise<WeekPlanInfo | null> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from("week_plans")
    .select("week_start, timezone")
    .eq("patient_id", patientId)
    .eq("week_start", weekStart)
    .maybeSingle()
  return data ? { weekStart: data.week_start, timezone: data.timezone } : null
}

export interface ExpectedDose {
  id: string
  medicineId: string | null
  medicineName: string
  scheduledDate: string
  scheduledTime: string
}

export async function getExpectedDoses(
  patientId: string,
  weekStart: string,
): Promise<ExpectedDose[]> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from("expected_doses")
    .select("id, medicine_id, medicine_name, scheduled_date, scheduled_time")
    .eq("patient_id", patientId)
    .eq("week_start", weekStart)
    .order("scheduled_date", { ascending: true })
    .order("scheduled_time", { ascending: true })

  return (data ?? []).map((row) => ({
    id: row.id,
    medicineId: row.medicine_id,
    medicineName: row.medicine_name,
    scheduledDate: row.scheduled_date,
    scheduledTime: row.scheduled_time,
  }))
}

export interface RemovedMidweek {
  medicine_name?: string
  count?: number
  removed_on?: string
}

export interface WeeklySummaryRow {
  id: string
  patientId: string
  weekStart: string
  weekEnd: string
  planTracked: boolean
  expectedCount: number
  takenCount: number
  skippedCount: number
  unscheduledCount: number
  adherenceRate: number | null
  skippedByReason: Record<string, number>
  lowStock: { name: string; stock: number }[]
  expiring: { name: string; daysLeft: number }[]
  removedMidweek: RemovedMidweek[]
  summaryEn: string | null
  summaryFil: string | null
  model: string | null
  generatedAt: string
  isReviewed: boolean
  reviewedAt: string | null
}

function toWeeklySummary(row: {
  id: string
  patient_id: string
  week_start: string
  week_end: string
  plan_tracked: boolean
  expected_count: number
  taken_count: number
  skipped_count: number
  unscheduled_count: number
  adherence_rate: number | string | null
  skipped_by_reason: unknown
  low_stock: unknown
  expiring: unknown
  removed_midweek: unknown
  summary_en: string | null
  summary_fil: string | null
  model: string | null
  generated_at: string
  is_reviewed: boolean
  reviewed_at: string | null
}): WeeklySummaryRow {
  return {
    id: row.id,
    patientId: row.patient_id,
    weekStart: row.week_start,
    weekEnd: row.week_end,
    planTracked: row.plan_tracked,
    expectedCount: row.expected_count,
    takenCount: row.taken_count,
    skippedCount: row.skipped_count,
    unscheduledCount: row.unscheduled_count,
    adherenceRate:
      row.adherence_rate === null ? null : Number(row.adherence_rate),
    skippedByReason: (row.skipped_by_reason ?? {}) as Record<string, number>,
    lowStock: (row.low_stock ?? []) as { name: string; stock: number }[],
    expiring: (row.expiring ?? []) as { name: string; daysLeft: number }[],
    removedMidweek: (row.removed_midweek ?? []) as RemovedMidweek[],
    summaryEn: row.summary_en,
    summaryFil: row.summary_fil,
    model: row.model,
    generatedAt: row.generated_at,
    isReviewed: row.is_reviewed,
    reviewedAt: row.reviewed_at,
  }
}

const WEEKLY_SUMMARY_COLUMNS =
  "id, patient_id, week_start, week_end, plan_tracked, expected_count, taken_count, skipped_count, unscheduled_count, adherence_rate, skipped_by_reason, low_stock, expiring, removed_midweek, summary_en, summary_fil, model, generated_at, is_reviewed, reviewed_at"

export async function getWeeklySummaries(
  patientId: string,
  limit = 8,
): Promise<WeeklySummaryRow[]> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from("weekly_summaries")
    .select(WEEKLY_SUMMARY_COLUMNS)
    .eq("patient_id", patientId)
    .order("week_start", { ascending: false })
    .limit(limit)

  return (data ?? []).map((row) => toWeeklySummary(row))
}

export async function getWeeklySummary(
  patientId: string,
  weekStart: string,
): Promise<WeeklySummaryRow | null> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from("weekly_summaries")
    .select(WEEKLY_SUMMARY_COLUMNS)
    .eq("patient_id", patientId)
    .eq("week_start", weekStart)
    .maybeSingle()
  return data ? toWeeklySummary(data) : null
}

export async function getPatients(householdId: string): Promise<Patient[]> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from("patients")
    .select(PATIENT_COLUMNS)
    .eq("household_id", householdId)
    .order("name", { ascending: true })
  return (data ?? []).map((row) => toPatient(row))
}
