"use server"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import { ownerHouseholdId, requireSession, requireStaff } from "@/lib/auth"
import { fail, mapDbError, ok, type ActionResult } from "@/lib/action-result"
import { revalidateViews } from "@/lib/revalidate"
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
  const { context, error: authError } = await requireSession()
  if (!context) return { ok: false, error: authError }

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
    revalidateViews("medicine")
    return { ok: true, data: { id: medicineId } }
  }

  const { data, error } = await supabase
    .from("medicines")
    .insert({ ...payload, created_by: context.userId })
    .select("id")
    .single()

  if (error) return { ok: false, error: mapDbError(error) }
  revalidateViews("medicine")
  return { ok: true, data: { id: data.id as string } }
}

export async function archiveMedicineAction(
  medicineId: string,
): Promise<ActionResult> {
  const { context, error: authError } = await requireSession()
  if (!context) return fail(authError)
  if (!ownerHouseholdId(context)) {
    return fail("Only the household owner can archive medicines.")
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase
    .from("medicines")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", medicineId)

  if (error) return fail(mapDbError(error))

  // A finished prescription must not depress this week's adherence for doses
  // nobody could take: drop its future frozen slots, keep the past ones.
  const todayIso = getTodayInTimeZone(await getTimeZone())
  await supabase.rpc("remove_future_expected", {
    p_medicine_id: medicineId,
    p_today: todayIso,
  })

  revalidateViews("medicine")
  revalidateViews("summary")
  return ok(null)
}

/**
 * Discard the remaining stock and archive the medicine, keeping its history.
 * Owner only; the RPC enforces that as well. Returns how many doses went.
 */
export async function disposeMedicineAction(
  medicineId: string,
): Promise<ActionResult<{ discarded: number }>> {
  const { context, error: authError } = await requireSession()
  if (!context) return fail(authError)
  if (!ownerHouseholdId(context)) {
    return fail("Only the household owner can dispose of medicines.")
  }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc("dispose_medicine", {
    p_medicine_id: medicineId,
  })
  if (error) return fail(mapDbError(error))

  // Same reason as archiving: doses nobody can take must not depress this
  // week's adherence. Past frozen slots stay.
  const todayIso = getTodayInTimeZone(await getTimeZone())
  await supabase.rpc("remove_future_expected", {
    p_medicine_id: medicineId,
    p_today: todayIso,
  })

  revalidateViews("medicine")
  revalidateViews("summary")
  return ok({ discarded: Number(data ?? 0) })
}

/**
 * Undo a disposal inside the short window. The quantity comes from the ledger
 * row the disposal wrote, never from the client.
 *
 * Both halves are reversed: the stock and the archive, then the frozen future
 * slots the disposal removed. Restoring only the medicine left the week's
 * denominator short of the cabinet, which quietly inflated adherence for the
 * rest of an in-progress week.
 */
export async function undoDisposeMedicineAction(
  medicineId: string,
): Promise<ActionResult<{ restored: number }>> {
  const { context, error: authError } = await requireSession()
  if (!context) return fail(authError)
  if (!ownerHouseholdId(context)) {
    return fail("Only the household owner can undo a disposal.")
  }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc("undo_dispose_medicine", {
    p_medicine_id: medicineId,
  })
  if (error) return fail(mapDbError(error))

  // The medicine is back, so its remaining doses for this week are expected
  // again. Future-only and frozen-weeks-only, enforced inside the RPC.
  const todayIso = getTodayInTimeZone(await getTimeZone())
  const { error: restoreError } = await supabase.rpc(
    "restore_future_expected",
    { p_medicine_id: medicineId, p_today: todayIso },
  )
  if (restoreError) {
    // The medicine and its stock are already restored; say so rather than
    // reporting a failed undo and inviting a second one.
    console.error("dispose: restore_future_expected failed", {
      medicineId,
      code: restoreError.code,
    })
  }

  revalidateViews("medicine")
  revalidateViews("summary")
  return ok({ restored: Number(data ?? 0) })
}

export async function restoreMedicineAction(
  medicineId: string,
): Promise<ActionResult> {
  const { context, error: authError } = await requireSession()
  if (!context) return fail(authError)
  if (!ownerHouseholdId(context)) {
    return fail("Only the household owner can restore medicines.")
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase
    .from("medicines")
    .update({ archived_at: null })
    .eq("id", medicineId)

  if (error) return fail(mapDbError(error))
  revalidateViews("medicine")
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
  revalidateViews("medicine")
  return ok(null)
}

export async function restockAction(
  medicineId: string,
  quantity: number | string,
): Promise<ActionResult<{ stock: number }>> {
  // A patient-role member is a household member, so the RPC's staff check is
  // the real boundary; failing here keeps the message out of the database layer.
  const { context, error: authError } = await requireStaff()
  if (!context) return fail(authError)

  const quantityError = validateRestockQuantity(quantity)
  if (quantityError) return fail(quantityError)

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc("restock_medicine", {
    p_medicine_id: medicineId,
    p_quantity: Number(quantity),
  })

  if (error) return fail(mapDbError(error))
  revalidateViews("medicine")
  return ok({ stock: Number(data) })
}

/** Owner-only direct stock edit, recorded as `owner_edit` by the trigger. */
export async function adjustStockAction(
  medicineId: string,
  delta: number,
): Promise<ActionResult> {
  const { context, error: authError } = await requireSession()
  if (!context) return fail(authError)
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
  revalidateViews("medicine")
  return ok(null)
}
