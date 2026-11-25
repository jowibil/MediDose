"use server"

import { revalidatePath } from "next/cache"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import { canAccessPatient, requireSession, requireStaff } from "@/lib/auth"
import {
  getDoseLogs,
  getExpectedDoses,
  getMedicinesIncludingArchived,
  getWeekPlan,
  getWeeklySummary,
} from "@/lib/data"
import { buildWeekSlots, buildWeekStats, weekRange } from "@/lib/summary"
import { fail, mapDbError, ok, type ActionResult } from "@/lib/action-result"
import { daysUntil, getTodayInTimeZone } from "@/lib/dates"
import { completeJson, completionText, AiError } from "@/lib/ai/client"
import { buildSummaryUserPrompt, SUMMARY_SYSTEM_PROMPT } from "@/lib/ai/prompts"

/**
 * Freezes the week if it is not frozen yet. Called from the dashboard on every
 * visit, so it never throws and never blocks the page. `freeze_week` is
 * idempotent, and the select below skips the RPC entirely for the common case.
 *
 * Returns whether the week is frozen. A failed RPC used to be dropped on the
 * floor: the page rendered as "untracked", the summary was then written from an
 * empty denominator, and nothing anywhere said why. Now the failure is logged
 * and the return value lets the summaries page say so out loud.
 */
export async function ensureWeekFrozen(
  patientId: string,
  weekStart: string,
  timeZone: string,
): Promise<boolean> {
  const { context } = await requireSession()
  if (!context || !canAccessPatient(context, patientId)) return false

  const supabase = await createSupabaseServerClient()
  const plan = await getWeekPlan(patientId, weekStart)
  if (plan) return true

  const medicines = await getMedicinesIncludingArchived(patientId)
  const slots = buildWeekSlots(medicines, weekStart).map((slot) => ({
    medicine_id: slot.medicineId,
    medicine_name: slot.medicineName,
    date: slot.scheduledDate,
    time: slot.scheduledTime,
  }))

  const { error } = await supabase.rpc("freeze_week", {
    p_patient_id: patientId,
    p_week_start: weekStart,
    p_timezone: timeZone,
    p_slots: slots,
  })

  if (error) {
    // Ids only: no patient names or medicine names in logs.
    console.error("summary: freeze_week failed", {
      patientId,
      weekStart,
      code: error.code,
      message: error.message,
    })
    return false
  }

  return true
}

/**
 * Generates (or overwrites) one week's summary. The counters come from the
 * frozen slots, the prose from the AI service, and a missing key is a message,
 * never a crashed page.
 */
export async function generateWeeklySummaryAction(input: {
  patientId: string
  weekStart: string
  timeZone: string
}): Promise<ActionResult<{ id: string }>> {
  const { context, error: authError } = await requireStaff()
  if (!context) return fail(authError)
  if (!canAccessPatient(context, input.patientId)) {
    return fail("You don’t have access to that patient.")
  }

  const supabase = await createSupabaseServerClient()
  const { data: patient } = await supabase
    .from("patients")
    .select("name, household_id")
    .eq("id", input.patientId)
    .maybeSingle()

  if (!patient) return fail("We couldn’t find that patient.")

  const plan = await getWeekPlan(input.patientId, input.weekStart)
  const frozen = plan
    ? await getExpectedDoses(input.patientId, input.weekStart)
    : []
  const slots = frozen.map((row) => ({
    medicineId: row.medicineId ?? "",
    medicineName: row.medicineName,
    scheduledDate: row.scheduledDate,
    scheduledTime: row.scheduledTime,
  }))

  const medicines = await getMedicinesIncludingArchived(input.patientId)
  const { start, end } = weekRange(input.weekStart)
  const logs = await getDoseLogs(
    medicines.map((medicine) => medicine.id),
    start,
    end,
  )

  const todayIso = getTodayInTimeZone(input.timeZone)
  const stats = buildWeekStats({
    slots,
    logs,
    weekStart: input.weekStart,
    todayIso,
    planTracked: Boolean(plan),
  })

  const previous = await getWeeklySummary(input.patientId, input.weekStart)
  const removed = previous?.removedMidweek ?? []

  // Only the active cabinet: an archived medicine is not something to restock.
  const active = medicines.filter((medicine) => !medicine.archivedAt)
  const lowStock = active
    .filter((medicine) => medicine.stock <= 5 && medicine.stock >= 0)
    .map((medicine) => ({ name: medicine.name, stock: medicine.stock }))
  const expiring = active
    .map((medicine) => ({
      name: medicine.name,
      daysLeft: daysUntil(medicine.expirationDate, todayIso),
    }))
    .filter((entry) => entry.daysLeft >= 0 && entry.daysLeft <= 30)

  let summaryEn: string | null = null
  let summaryFil: string | null = null
  let model: string | null = null

  try {
    const completion = await completeJson({
      system: SUMMARY_SYSTEM_PROMPT,
      user: buildSummaryUserPrompt({
        patientName: patient.name,
        weekLabel: `${input.weekStart} – ${end}`,
        stats,
        removedMidweek: removed,
        lowStock,
        expiring,
      }),
    })
    summaryEn = completionText(completion.data, "en")
    summaryFil = completionText(completion.data, "fil")
    model = completion.model
  } catch (error) {
    if (error instanceof AiError) return fail(error.message)
    return fail("The summary could not be written. Please try again.")
  }

  if (!summaryEn) {
    return fail("The AI service returned an empty summary. Please try again.")
  }

  const { data: id, error } = await supabase.rpc("save_weekly_summary", {
    p_patient_id: input.patientId,
    p_week_start: input.weekStart,
    p_payload: {
      week_end: end,
      timezone: plan?.timezone ?? input.timeZone,
      plan_tracked: Boolean(plan),
      expected_count: stats.expected,
      taken_count: stats.taken,
      skipped_count: stats.skipped,
      unscheduled_count: stats.unscheduled,
      adherence_rate: stats.adherenceRate,
      skipped_by_reason: stats.skippedByReason,
      low_stock: lowStock,
      expiring,
      removed_midweek: removed,
      summary_en: summaryEn,
      summary_fil: summaryFil,
      model,
    },
  })

  if (error) return fail(mapDbError(error))

  revalidatePath("/summaries")
  revalidatePath("/dashboard")
  return ok({ id: String(id) })
}

/** Marks the current content human-reviewed, or clears that flag. */
export async function markSummaryReviewedAction(
  summaryId: string,
  reviewed: boolean,
): Promise<ActionResult> {
  const { context, error: authError } = await requireStaff()
  if (!context) return fail(authError)

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc("set_summary_reviewed", {
    p_summary_id: summaryId,
    p_reviewed: reviewed,
  })

  if (error) return fail(mapDbError(error))
  revalidatePath("/summaries")
  return ok(null)
}
