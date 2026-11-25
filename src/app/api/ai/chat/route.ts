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
  screenHistory,
  screenQuestion,
} from "@/lib/ai/guardrails"
import {
  buildAssistantSystemPrompt,
  buildAssistantUserPrompt,
} from "@/lib/ai/prompts"
import {
  AI_UNAVAILABLE,
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
 *   6. burst cooldown + daily quota, consumed atomically in the database and
 *      refunded if the provider fails, so a 502 never costs a question. The
 *      cooldown runs from the moment the previous request was *accepted*, so a
 *      slow answer does not block the next question and two simultaneous
 *      requests still resolve to one;
 *   7. answer screening: no dose-change advice, bounded length
 *
 * The record is scoped by the reader's role (owner: household, caregiver:
 * household with their narrower abilities, patient: own record only), and the
 * last few turns are carried so the panel reads as a conversation. Provider and
 * configuration detail never leaves the server log.
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
  // Earlier turns are clipped and role-checked; they are conversation, not input.
  const history = screenHistory((body as { history?: unknown } | null)?.history)

  const validationError = validateAssistantQuestion(question)
  if (validationError) return fail(validationError, 400)

  const screen = screenQuestion(question)
  if (!screen.allowed) return fail(screen.reason, 400)

  const context = await getSessionContext()
  if (!context) return fail("Please sign in again.", 401)

  if (!isAiConfigured()) {
    // The variable name belongs in the log, not in the panel.
    console.error("assistant: AI_API_KEY is not set")
    return fail(AI_UNAVAILABLE, 503)
  }

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

  // The reader's role decides how much household the record may describe. A
  // patient account gets no roster at all; staff get the names in this
  // household so "who else is here?" can be answered without ids.
  // The role that matters is the one in this patient's household, not the
  // account's strongest role elsewhere.
  const viewerRole = active.role
  const householdPatients =
    viewerRole === "patient"
      ? []
      : (context.households
          .find((group) => group.householdId === active.householdId)
          ?.patients.map((patient) => patient.name) ?? [])

  const record = buildMedicineContext({
    viewer: {
      role: viewerRole,
      householdName: active.householdName,
      patients: householdPatients,
    },
    patient: { name: active.name },
    medicines,
    logs,
    todayIso,
  })

  try {
    const answer = await completeText({
      system: buildAssistantSystemPrompt(viewerRole),
      user: buildAssistantUserPrompt({
        question,
        record: serializeContext(record),
        language,
      }),
      history,
    })

    return NextResponse.json(
      { answer: screenAnswer(answer) },
      { headers: { "cache-control": "no-store" } },
    )
  } catch (error) {
    // The quota buys an answer, not an attempt: give it back. A failed refund
    // must not replace the real error, so it is swallowed.
    try {
      await supabase.rpc("refund_ai_request")
    } catch {
      // Nothing to do: the provider error below is the useful message.
    }
    // Provider detail stays in the log; the panel gets one plain sentence.
    console.error("assistant: provider call failed", {
      kind: error instanceof AiError ? error.kind : "unexpected",
      message: error instanceof AiError ? error.message : undefined,
    })
    return fail(AI_UNAVAILABLE, 502)
  }
}
