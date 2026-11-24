import { createSupabaseServerClient } from "@/lib/supabase/server"
import { toMedicine, toPatient } from "@/lib/mappers"
import type { Medicine, Patient } from "@/types/medicine"
import type { DoseLogRow } from "@/lib/occurrences"

export async function getMedicines(patientId: string): Promise<Medicine[]> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from("medicines")
    .select("*")
    .eq("patient_id", patientId)
    .is("archived_at", null)
    .order("name", { ascending: true })

  return (data ?? []).map((row) => toMedicine(row))
}

/** Active plus archived medicines, used to keep past dose history readable. */
export async function getMedicinesIncludingArchived(
  patientId: string,
): Promise<Medicine[]> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from("medicines")
    .select("*")
    .eq("patient_id", patientId)
    .order("name", { ascending: true })

  return (data ?? []).map((row) => toMedicine(row))
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
    .select("*")
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

export async function getPatients(householdId: string): Promise<Patient[]> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from("patients")
    .select("*")
    .eq("household_id", householdId)
    .order("name", { ascending: true })
  return (data ?? []).map((row) => toPatient(row))
}
