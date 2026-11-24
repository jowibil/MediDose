"use server"

import { revalidatePath } from "next/cache"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import { getSessionContext, ownerHouseholdId } from "@/lib/auth"
import { fail, mapDbError, ok, type ActionResult } from "@/lib/action-result"
import {
  hasErrors,
  validateMedicineForm,
  validateRestockQuantity,
  type MedicineFormValues,
} from "@/lib/validation"
import type { SaveMedicineResult } from "@/lib/form-results"
import { getTodayInTimeZone } from "@/lib/dates"
import { timeSlotsForFrequency } from "@/lib/schedule"
import { getTimeZone } from "@/lib/timezone"

function revalidateMedicineViews(): void {
  revalidatePath("/dashboard")
  revalidatePath("/medicines")
  revalidatePath("/history")
  revalidatePath("/settings")
}

function formPayload(values: MedicineFormValues, patientId: string) {
  const frequency = Number(values.frequencyPerDay)
  const scheduleTimes = timeSlotsForFrequency(
    frequency,
    values.firstDoseTime || "08:00",
    values.scheduleMode,
    values.scheduleMode === "custom" ? values.customTimes : [],
  )

  return {
    patient_id: patientId,
    name: values.name.trim(),
    dosage_amount: Number(values.dosageAmount),
    dosage_unit: values.dosageUnit,
    frequency_per_day: frequency,
    schedule_mode: values.scheduleMode,
    first_dose_time: values.firstDoseTime || "08:00",
    custom_times: values.scheduleMode === "custom" ? values.customTimes : null,
    schedule_times: scheduleTimes,
    stock_on_hand: Number(values.stock),
    expiration_date: values.expirationDate,
    treatment_end_date: values.treatmentEndDate || null,
  }
}

export async function saveMedicineAction(
  values: MedicineFormValues,
  medicineId?: string,
): Promise<SaveMedicineResult> {
  const context = await getSessionContext()
  if (!context) return { ok: false, error: "Please sign in again." }

  const householdId = ownerHouseholdId(context)
  if (!householdId) {
    return { ok: false, error: "Only the household owner can edit medicines." }
  }

  const timeZone = await getTimeZone()
  const fieldErrors = validateMedicineForm(values, {
    todayIso: getTodayInTimeZone(timeZone),
  })
  if (hasErrors(fieldErrors)) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors,
    }
  }

  const supabase = await createSupabaseServerClient()

  let patientId = values.patientId
  if (values.newPatientName.trim()) {
    const { data: patient, error: patientError } = await supabase
      .from("patients")
      .insert({
        household_id: householdId,
        name: values.newPatientName.trim(),
      })
      .select("id")
      .single()

    if (patientError) {
      return { ok: false, error: mapDbError(patientError) }
    }
    patientId = patient.id as string
  } else {
    const { data: patient } = await supabase
      .from("patients")
      .select("id, household_id")
      .eq("id", patientId)
      .maybeSingle()

    if (!patient || patient.household_id !== householdId) {
      return { ok: false, error: "Choose a patient in your household." }
    }
  }

  const payload = formPayload(values, patientId)

  if (medicineId) {
    const { data: existing } = await supabase
      .from("medicines")
      .select("id, patient_id, archived_at")
      .eq("id", medicineId)
      .maybeSingle()

    if (!existing) {
      return { ok: false, error: "That medicine no longer exists." }
    }
    if (existing.archived_at) {
      return { ok: false, error: "Restore this medicine before editing it." }
    }

    const { error } = await supabase
      .from("medicines")
      .update(payload)
      .eq("id", medicineId)

    if (error) return { ok: false, error: mapDbError(error) }
    revalidateMedicineViews()
    return { ok: true, data: { id: medicineId } }
  }

  const { data, error } = await supabase
    .from("medicines")
    .insert({ ...payload, created_by: context.userId })
    .select("id")
    .single()

  if (error) return { ok: false, error: mapDbError(error) }
  revalidateMedicineViews()
  return { ok: true, data: { id: data.id as string } }
}

export async function archiveMedicineAction(
  medicineId: string,
): Promise<ActionResult> {
  const context = await getSessionContext()
  if (!context) return fail("Please sign in again.")
  if (!ownerHouseholdId(context)) {
    return fail("Only the household owner can archive medicines.")
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase
    .from("medicines")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", medicineId)

  if (error) return fail(mapDbError(error))
  revalidateMedicineViews()
  return ok(null)
}

export async function restoreMedicineAction(
  medicineId: string,
): Promise<ActionResult> {
  const context = await getSessionContext()
  if (!context) return fail("Please sign in again.")
  if (!ownerHouseholdId(context)) {
    return fail("Only the household owner can restore medicines.")
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase
    .from("medicines")
    .update({ archived_at: null })
    .eq("id", medicineId)

  if (error) return fail(mapDbError(error))
  revalidateMedicineViews()
  return ok(null)
}

export async function purgeMedicineAction(
  medicineId: string,
): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc("purge_medicine", {
    p_medicine_id: medicineId,
  })
  if (error) return fail(mapDbError(error))
  revalidateMedicineViews()
  return ok(null)
}

export async function restockAction(
  medicineId: string,
  quantity: number | string,
): Promise<ActionResult<{ stock: number }>> {
  const quantityError = validateRestockQuantity(quantity)
  if (quantityError) return fail(quantityError)

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc("restock_medicine", {
    p_medicine_id: medicineId,
    p_quantity: Number(quantity),
  })

  if (error) return fail(mapDbError(error))
  revalidateMedicineViews()
  return ok({ stock: Number(data) })
}

/** Owner-only direct stock edit, recorded as `owner_edit` by the trigger. */
export async function adjustStockAction(
  medicineId: string,
  delta: number,
): Promise<ActionResult> {
  const context = await getSessionContext()
  if (!context) return fail("Please sign in again.")
  if (!ownerHouseholdId(context)) {
    return fail("Only the household owner can edit stock directly.")
  }
  if (!Number.isInteger(delta) || delta === 0) {
    return fail("Enter a whole number of doses.")
  }

  const supabase = await createSupabaseServerClient()
  const { data: medicine } = await supabase
    .from("medicines")
    .select("stock_on_hand")
    .eq("id", medicineId)
    .maybeSingle()

  if (!medicine) return fail("That medicine no longer exists.")

  const nextStock = Math.max(0, medicine.stock_on_hand + delta)
  if (nextStock === medicine.stock_on_hand) return ok(null)

  const { error } = await supabase
    .from("medicines")
    .update({ stock_on_hand: nextStock })
    .eq("id", medicineId)

  if (error) return fail(mapDbError(error))
  revalidateMedicineViews()
  return ok(null)
}
