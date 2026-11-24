/**
 * The auth emails MediDose actually posts.
 *
 * Supabase Auth calls our Send Email Hook (`src/app/api/auth/send-email`) with
 * a one-time token and its hash; this module turns that payload into the
 * messages we send. It replaces Supabase's built-in templates, so the copy,
 * the brand and the links live in the repo instead of in a dashboard.
 *
 * Pure string work — no I/O, no env, no clock — so the copy and the links are
 * unit testable. Nothing here ever sees a password.
 */

export interface AuthEmailUser {
  email?: string | null
  new_email?: string | null
  user_metadata?: Record<string, unknown> | null
}

export interface AuthEmailData {
  token: string
  token_hash: string
  redirect_to: string
  email_action_type: string
  site_url: string
  token_new?: string | null
  token_hash_new?: string | null
}

export interface AuthEmailPayload {
  user: AuthEmailUser
  email_data: AuthEmailData
}

export interface RenderedEmail {
  to: string
  subject: string
  html: string
  text: string
}

interface Message {
  subject: string
  heading: string
  /** One paragraph per entry, in order. */
  paragraphs: string[]
  cta: { label: string; href: string } | null
  /** A short code for actions that do not use a link (reauthentication). */
  code: string | null
  note: string
}

const BRAND = {
  product: "MediDose",
  tagline: "Medication schedules, stock and caregiver access for your household.",
  paper: "#edf0ea",
  surface: "#fbfbf6",
  ink: "#1c2a25",
  inkSoft: "#566660",
  line: "#d8dfd5",
  sage: "#3d6b52",
  sageSoft: "#dce9df",
  sageInk: "#2b5440",
} as const

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

/**
 * `redirect_to` is set by Auth from our allow-list; the configured site URL and
 * then the dashboard `site_url` are fallbacks. `site_url` can be stale (often
 * localhost), so the explicit env var sits ahead of it; the last value is the
 * local-development fallback only.
 */
function safeOrigin(...candidates: Array<string | null | undefined>): string {
  for (const candidate of candidates) {
    if (!candidate) continue
    try {
      const url = new URL(candidate)
      if (url.protocol === "https:" || url.protocol === "http:") return url.origin
    } catch {
      // Not an absolute URL; try the next candidate.
    }
  }
  return "http://localhost:3000"
}

/** Only relative, same-site paths: `next` must not become an open redirect. */
function safeNext(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    const next = new URL(raw).searchParams.get("next")
    if (next && next.startsWith("/") && !next.startsWith("//")) return next
  } catch {
    // `redirect_to` was not a URL; no `next` to carry over.
  }
  return null
}

/**
 * `fixedNext` wins over the redirect's own `next`: a recovery link must land on
 * the password form, never on the dashboard, or the old password stays in use.
 * Everything else carries the `next` the action chose (sign-up sends caregivers
 * to `/join`, owners to `/dashboard`).
 */
function confirmLink(
  payload: AuthEmailPayload,
  tokenHash: string,
  otpType: string,
  fixedNext?: string,
): string {
  const { redirect_to, site_url } = payload.email_data
  const origin = safeOrigin(
    redirect_to,
    process.env.NEXT_PUBLIC_SITE_URL,
    site_url,
  )
  const params = new URLSearchParams({ token_hash: tokenHash, type: otpType })
  const next = fixedNext ?? safeNext(redirect_to)
  if (next) params.set("next", next)
  return `${origin}/auth/confirm?${params.toString()}`
}

function displayName(user: AuthEmailUser): string | null {
  const value = user.user_metadata?.display_name
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function greeting(user: AuthEmailUser): string {
  const name = displayName(user)
  return name ? `Hi ${name},` : "Hi,"
}

function expiryNote(link: boolean): string {
  return link
    ? "This link works once and expires in an hour. If it has expired, request a new one from the app."
    : "This code expires in an hour. If it has expired, start again from the app."
}

function renderHtml(message: Message, to: string): string {
  const button = message.cta
    ? `<tr><td style="padding: 8px 0 24px;">
              <a href="${escapeHtml(message.cta.href)}" style="display: inline-block; background: ${BRAND.sage}; color: #ffffff; font-family: Helvetica, Arial, sans-serif; font-size: 15px; font-weight: 600; line-height: 1; padding: 14px 22px; border-radius: 10px; text-decoration: none;">${escapeHtml(message.cta.label)}</a>
            </td></tr>`
    : ""

  const code = message.code
    ? `<tr><td style="padding: 4px 0 20px;">
              <div style="font-family: 'Courier New', Courier, monospace; font-size: 30px; letter-spacing: 6px; font-weight: 700; color: ${BRAND.ink}; background: ${BRAND.sageSoft}; border: 1px solid ${BRAND.line}; border-radius: 10px; padding: 16px 20px; text-align: center;">${escapeHtml(message.code)}</div>
            </td></tr>`
    : ""

  const linkFallback = message.cta
    ? `<tr><td style="padding: 0 0 20px;">
              <p style="margin: 0 0 6px; font-family: Helvetica, Arial, sans-serif; font-size: 12px; line-height: 1.5; color: ${BRAND.inkSoft};">If the button doesn’t work, paste this link into your browser:</p>
              <p style="margin: 0; font-family: 'Courier New', Courier, monospace; font-size: 12px; line-height: 1.5; word-break: break-all; color: ${BRAND.sageInk};">${escapeHtml(message.cta.href)}</p>
            </td></tr>`
    : ""

  const paragraphs = message.paragraphs
    .map(
      (paragraph) =>
        `<tr><td style="padding: 0 0 14px;"><p style="margin: 0; font-family: Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.6; color: ${BRAND.ink};">${escapeHtml(paragraph)}</p></td></tr>`,
    )
    .join("\n            ")

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(message.subject)}</title>
  </head>
  <body style="margin: 0; padding: 0; background: ${BRAND.paper};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: ${BRAND.paper}; padding: 32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px; background: ${BRAND.surface}; border: 1px solid ${BRAND.line}; border-radius: 14px;">
            <tr>
              <td style="padding: 28px 32px 8px;">
                <p style="margin: 0; font-family: Georgia, 'Times New Roman', serif; font-size: 18px; font-weight: 700; letter-spacing: -0.01em; color: ${BRAND.ink};">${BRAND.product}</p>
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 32px 0;">
                <h1 style="margin: 0 0 16px; font-family: Georgia, 'Times New Roman', serif; font-size: 24px; line-height: 1.25; font-weight: 600; color: ${BRAND.ink};">${escapeHtml(message.heading)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding: 0 32px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${paragraphs}
            ${code}
            ${button}
            ${linkFallback}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding: 0 32px 28px;">
                <p style="margin: 0; font-family: Helvetica, Arial, sans-serif; font-size: 12px; line-height: 1.6; color: ${BRAND.inkSoft};">${escapeHtml(message.note)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding: 18px 32px 24px; border-top: 1px solid ${BRAND.line};">
                <p style="margin: 0; font-family: Helvetica, Arial, sans-serif; font-size: 11px; line-height: 1.6; color: ${BRAND.inkSoft};">${BRAND.tagline}<br />Sent to ${escapeHtml(to)}. MediDose never asks for your password by email.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

function renderText(message: Message, to: string): string {
  const lines = [message.heading, "", ...message.paragraphs, ""]
  if (message.code) lines.push(`Code: ${message.code}`, "")
  if (message.cta) lines.push(`${message.cta.label}: ${message.cta.href}`, "")
  lines.push(message.note, "", BRAND.tagline, `Sent to ${to}.`)
  return lines.join("\n")
}

function toRendered(message: Message, to: string): RenderedEmail {
  return {
    to,
    subject: message.subject,
    html: renderHtml(message, to),
    text: renderText(message, to),
  }
}

/**
 * Supabase's `email_action_type` values map to the OTP types our
 * `/auth/confirm` route verifies. Sign-up confirmations use `email`, matching
 * the template documented in the README.
 */
const OTP_TYPE_BY_ACTION: Record<string, string> = {
  signup: "email",
  invite: "invite",
  magiclink: "magiclink",
  recovery: "recovery",
  email_change: "email_change",
}

export function isAuthEmailPayload(value: unknown): value is AuthEmailPayload {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as Partial<AuthEmailPayload>
  const data = candidate.email_data
  return (
    typeof candidate.user === "object" &&
    candidate.user !== null &&
    typeof data === "object" &&
    data !== null &&
    typeof data.token_hash === "string" &&
    typeof data.email_action_type === "string" &&
    typeof data.site_url === "string"
  )
}

/**
 * Builds every email one hook call needs. `email_change` with Secure Email
 * Change enabled returns two messages, one per address, because both sides
 * must approve.
 */
export function renderAuthEmails(payload: AuthEmailPayload): RenderedEmail[] {
  const { user, email_data: data } = payload
  const currentEmail = user.email ?? ""
  const newEmail = user.new_email ?? ""
  const action = data.email_action_type
  const otpType = OTP_TYPE_BY_ACTION[action] ?? "email"
  const greeter = greeting(user)

  switch (action) {
    case "signup":
      return [
        toRendered(
          {
            subject: "Confirm your email for MediDose",
            heading: "Confirm your email",
            paragraphs: [
              greeter,
              `Confirm ${currentEmail} to finish setting up your household in MediDose.`,
              "Until then, no one can sign in with this account.",
            ],
            cta: {
              label: "Confirm email",
              href: confirmLink(payload, data.token_hash, otpType),
            },
            code: null,
            note: expiryNote(true),
          },
          currentEmail,
        ),
      ]

    case "recovery":
      return [
        toRendered(
          {
            subject: "Reset your MediDose password",
            heading: "Choose a new password",
            paragraphs: [
              greeter,
              `We received a request to reset the password for ${currentEmail}.`,
              "If you didn’t ask for this, you can ignore this email — your password stays exactly as it is.",
            ],
            cta: {
              label: "Choose a new password",
              href: confirmLink(
                payload,
                data.token_hash,
                otpType,
                "/reset-password",
              ),
            },
            code: null,
            note: expiryNote(true),
          },
          currentEmail,
        ),
      ]

    case "magiclink":
      return [
        toRendered(
          {
            subject: "Your MediDose sign-in link",
            heading: "Sign in to MediDose",
            paragraphs: [
              greeter,
              `Use this link to sign in as ${currentEmail}.`,
              "If you didn’t try to sign in, you can ignore this email and nobody gets access.",
            ],
            cta: {
              label: "Sign in to MediDose",
              href: confirmLink(payload, data.token_hash, otpType),
            },
            code: null,
            note: expiryNote(true),
          },
          currentEmail,
        ),
      ]

    case "invite":
      return [
        toRendered(
          {
            subject: "You’ve been invited to MediDose",
            heading: "Set up your MediDose account",
            paragraphs: [
              greeter,
              `You’ve been invited to help manage medication schedules for a household. Use the link to set a password for ${currentEmail}.`,
            ],
            cta: {
              label: "Accept invitation",
              href: confirmLink(payload, data.token_hash, otpType),
            },
            code: null,
            note: expiryNote(true),
          },
          currentEmail,
        ),
      ]

    case "email_change":
    case "email_change_current":
    case "email_change_new": {
      // The token hash names are reversed for backward compatibility:
      // `token_hash_new` approves the CURRENT address, `token_hash` confirms
      // the NEW one. With Secure Email Change off only the new address exists.
      const emails: RenderedEmail[] = []

      if (currentEmail && data.token_hash_new) {
        emails.push(
          toRendered(
            {
              subject: "Approve your MediDose email change",
              heading: "Approve this email change",
              paragraphs: [
                greeter,
                `Approve moving this account to ${newEmail || "a new address"}. The change only takes effect once both addresses agree.`,
                "If you didn’t request this, ignore this email and nothing changes.",
              ],
              cta: {
                label: "Approve change",
                href: confirmLink(payload, data.token_hash_new, otpType),
              },
              code: null,
              note: expiryNote(true),
            },
            currentEmail,
          ),
        )
      }

      if (newEmail && data.token_hash) {
        emails.push(
          toRendered(
            {
              subject: "Confirm your new MediDose email",
              heading: "Confirm your new address",
              paragraphs: [
                greeter,
                `Confirm ${newEmail} as the sign-in address for your MediDose account.`,
              ],
              cta: {
                label: "Confirm this address",
                href: confirmLink(payload, data.token_hash, otpType),
              },
              code: null,
              note: expiryNote(true),
            },
            newEmail,
          ),
        )
      }

      if (emails.length > 0) return emails
      break
    }

    case "reauthentication":
      return [
        toRendered(
          {
            subject: "Your MediDose verification code",
            heading: "Confirm it’s you",
            paragraphs: [
              greeter,
              `Enter this code to finish verifying ${currentEmail}.`,
              "If you didn’t start this, ignore the email and consider changing your password.",
            ],
            cta: null,
            code: data.token,
            note: expiryNote(false),
          },
          currentEmail,
        ),
      ]

    default:
      break
  }

  // Unknown action: still send a usable link rather than failing the request.
  return [
    toRendered(
      {
        subject: "Confirm your MediDose request",
        heading: "Finish your MediDose request",
        paragraphs: [
          greeter,
          `Use the link to continue for ${currentEmail}.`,
        ],
        cta: {
          label: "Continue",
          href: confirmLink(payload, data.token_hash, otpType),
        },
        code: null,
        note: expiryNote(true),
      },
      currentEmail,
    ),
  ].filter((email) => email.to !== "")
}
