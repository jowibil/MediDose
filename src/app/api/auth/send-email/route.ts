/**
 * Supabase Auth's Send Email Hook endpoint.
 *
 * Supabase still mints the one-time tokens; this route verifies the webhook
 * signature, renders our own branded message from `src/lib/email/templates.ts`
 * and posts it over SMTP. It replaces Supabase's built-in sender, so nothing in
 * the dashboard holds our copy.
 *
 * Contract: an empty 200 body means "sent". Anything else surfaces to the
 * caller as `Error sending ... email` (HTTP 500), which is why failures are
 * logged here with the action type but never with an address or a token.
 */

import { NextResponse } from "next/server"

import { verifyEmailHookSignature } from "@/lib/email/email-webhook"
import { readSmtpConfig, sendRenderedEmail } from "@/lib/email/smtp"
import { isAuthEmailPayload, renderAuthEmails } from "@/lib/email/templates"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function refuse(status: number, reason: string) {
  return NextResponse.json({ error: reason }, { status })
}

export async function POST(request: Request) {
  const hookSecret = process.env.SEND_EMAIL_HOOK_SECRET
  if (!hookSecret) {
    console.error("[auth-email] SEND_EMAIL_HOOK_SECRET is not set")
    return refuse(500, "email_not_configured")
  }

  const smtp = readSmtpConfig()
  if (!smtp) {
    console.error("[auth-email] SMTP_USER and SMTP_PASSWORD are not set")
    return refuse(500, "email_not_configured")
  }

  // The signature covers the raw body, so read it as text before parsing.
  const payload = await request.text()
  const verdict = verifyEmailHookSignature({
    payload,
    secret: hookSecret,
    headers: {
      id: request.headers.get("webhook-id"),
      timestamp: request.headers.get("webhook-timestamp"),
      signature: request.headers.get("webhook-signature"),
    },
  })

  if (!verdict.ok) {
    console.warn(`[auth-email] rejected hook request: ${verdict.reason}`)
    return refuse(401, "invalid_signature")
  }

  let body: unknown
  try {
    body = JSON.parse(payload)
  } catch {
    return refuse(400, "invalid_payload")
  }
  if (!isAuthEmailPayload(body)) {
    return refuse(400, "invalid_payload")
  }

  const action = body.email_data.email_action_type
  const emails = renderAuthEmails(body)
  if (emails.length === 0) {
    console.error(`[auth-email] nothing to send for action "${action}"`)
    return refuse(500, "nothing_to_send")
  }

  try {
    for (const email of emails) {
      await sendRenderedEmail(email, smtp)
    }
  } catch (error) {
    console.error(
      `[auth-email] send failed for action "${action}":`,
      error instanceof Error ? error.message : error,
    )
    return refuse(500, "send_failed")
  }

  return NextResponse.json({})
}
