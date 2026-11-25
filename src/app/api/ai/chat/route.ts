import { NextResponse } from "next/server"

import { getSessionContext, resolveActivePatient } from "@/lib/auth"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { getMedicinesIncludingArchived, getDoseLogs } from "@/lib/data"
import { addISODays, getTodayInTimeZone } from "@/lib/dates"
import { getTimeZone } from "@/lib/timezone"
import { getLanguage } from "@/lib/language-server"
import { validateAssistantQuestion } from "@/lib/validation"
import { buildMedicineContext, serializeContext } from "@/lib/ai/context"
import {
  MAX_REQUEST_BYTES,
  isSameOriginRequest,
  normalizeQuestion,
  screenAnswer,
  screenQuestion,
} from "@/lib/ai/guardrails"
import {
  ASSISTANT_SYSTEM_PROMPT,
  buildAssistantUserPrompt,
} from "@/lib/ai/prompts"
import {
  AI_NOT_CONFIGURED,
  AiError,
  completeText,
  isAiConfigured,
} from "@/lib/ai/client"

/** Answers are personal; never let a proxy or browser cache one. */
function fail(error: string, status: number) {
  return NextResponse.json(
    { error },
    { status, headers: { "cache-control": "no-store" } },
  )
}

/**
 * Assistant answers.
 *
 * Guardrails, in order, all of them before a provider call is paid for:
 *   1. same-origin (the session cookie is SameSite=lax; this is the explicit check)
 *   2. JSON content type and a hard body-size cap
 *   3. normalised, length-checked question, screened for role-override attempts
 *   4. a real session, re-checked here rather than trusted from the middleware
 *   5. active-patient scope, so the record never spans patients
 *   6. burst cooldown + daily quota, consumed atomically in the database
 *   7. answer screening: no dose-change advice, bounded length
 *
 * Not in PUBLIC_PREFIXES in the middleware. No CSRF token is needed beyond the
 * cookie's SameSite policy plus (1): a cross-site POST carries neither.
 */
export async function POST(request: Request) {
  if (!isSameOriginRequest(request.headers)) {
    return fail("This request must come from the app.", 403)
  }

  const contentType = request.headers.get("content-type") ?? ""
  if (!contentType.toLowerCase().includes("application/json")) {
    return fail("Send a JSON body.", 415)
  }

  let raw: string
  try {
    raw = await request.text()
  } catch {
    return fail("The request could not be read.", 400)
  }
  if (raw.length > MAX_REQUEST_BYTES) {
    return fail("That request is too large.", 413)
  }

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return fail("Send a JSON body.", 400)
  }

  const bodyQuestion = (body as { question?: unknown } | null)?.question
  const question = normalizeQuestion(
    typeof bodyQuestion === "string" ? bodyQuestion : "",
  )

  const validationError = validateAssistantQuestion(question)
  if (validationError) return fail(validationError, 400)

  const screen = screenQuestion(question)
  if (!screen.allowed) {
    return fail(screen.reason ?? "That question can’t be answered.", 400)
  }

  const context = await getSessionContext()
  if (!context) return fail("Please sign in again.", 401)

  if (!isAiConfigured()) return fail(AI_NOT_CONFIGURED, 503)

  // The active patient is the whole scope: RLS narrowed the rows, and the
  // builder only ever sees this one record.
  const active = await resolveActivePatient(context)
  if (!active) {
    return fail("There is no patient record to answer about yet.", 409)
  }

  const supabase = await createSupabaseServerClient()
  const { data: gate, error: gateError } = await supabase.rpc(
    "begin_ai_request",
    { p_daily_limit: 30, p_cooldown_seconds: 2 },
  )
  if (gateError) {
    return fail("The assistant is unavailable right now.", 500)
  }
  if (gate === "cooldown") {
    return fail("One question at a time — try again in a moment.", 429)
  }
  if (gate !== "ok") {
    return fail("You have reached today’s assistant limit. Try again tomorrow.", 429)
  }

  const timeZone = await getTimeZone()
  const todayIso = getTodayInTimeZone(timeZone)
  const medicines = await getMedicinesIncludingArchived(active.id)
  const logs = await getDoseLogs(
    medicines.map((medicine) => medicine.id),
    addISODays(todayIso, -27),
    todayIso,
  )
  const language = await getLanguage()

  const record = buildMedicineContext({
    patient: { name: active.name },
    medicines,
    logs,
    todayIso,
  })

  try {
    const answer = await completeText({
      system: ASSISTANT_SYSTEM_PROMPT,
      user: buildAssistantUserPrompt({
        question,
        record: serializeContext(record),
        language,
      }),
    })

    const screened = screenAnswer(answer)
    return NextResponse.json(
      { answer: screened.text },
      { headers: { "cache-control": "no-store" } },
    )
  } catch (error) {
    if (error instanceof AiError) return fail(error.message, 502)
    return fail("The assistant could not answer. Please try again.", 502)
  }
}
