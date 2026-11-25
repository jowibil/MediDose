"use server"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import { fail, mapDbError, ok, type ActionResult } from "@/lib/action-result"
import { revalidateViews } from "@/lib/revalidate"
import { validateSkipInput } from "@/lib/validation"
import { getTimeZone } from "@/lib/timezone"

async function safeTimeZone(timeZone?: string): Promise<string> {
  if (timeZone && timeZone.trim()) return timeZone
  return getTimeZone()
}

export async function logTakenAction(input: {
  medicineId: string
  scheduledDate: string
  scheduledTime: string
  timeZone?: string
}): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc("log_dose", {
    p_medicine_id: input.medicineId,
    p_scheduled_date: input.scheduledDate,
    p_scheduled_time: input.scheduledTime,
    p_status: "taken",
    p_skip_reason: null,
    p_skip_note: null,
    p_timezone: await safeTimeZone(input.timeZone),
  })

  if (error) return fail(mapDbError(error))
  revalidateViews()
  return ok(null)
}

export async function logSkippedAction(input: {
  medicineId: string
  scheduledDate: string
  scheduledTime: string
  reason: string
  note?: string | null
  timeZone?: string
}): Promise<ActionResult> {
  const validated = validateSkipInput(input.reason, input.note)
  if (!validated.ok) return fail(validated.error)

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc("log_dose", {
    p_medicine_id: input.medicineId,
    p_scheduled_date: input.scheduledDate,
    p_scheduled_time: input.scheduledTime,
    p_status: "skipped",
    p_skip_reason: validated.reason,
    p_skip_note: validated.note,
    p_timezone: await safeTimeZone(input.timeZone),
  })

  if (error) return fail(mapDbError(error))
  revalidateViews()
  return ok(null)
}

export async function updateDoseStatusAction(input: {
  logId: string
  status: "taken" | "skipped"
  reason?: string | null
  note?: string | null
}): Promise<ActionResult> {
  let reason: string | null = null
  let note: string | null = null

  if (input.status === "skipped") {
    const validated = validateSkipInput(input.reason, input.note)
    if (!validated.ok) return fail(validated.error)
    reason = validated.reason
    note = validated.note
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc("update_dose_status", {
    p_dose_log_id: input.logId,
    p_status: input.status,
    p_skip_reason: reason,
    p_skip_note: note,
  })

  if (error) return fail(mapDbError(error))
  revalidateViews()
  return ok(null)
}
