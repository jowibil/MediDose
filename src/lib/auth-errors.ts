/**
 * User-safe copy for Supabase Auth errors.
 *
 * Supabase returns HTTP 429 for three unrelated limits that all look the same
 * to a user, so the mapping uses the error's `code` (and, for the two that
 * share `over_email_send_rate_limit`, its message) to say what actually
 * happened. Never echoes the provider's text, the password, or whether an
 * address is registered.
 */

import { PASSWORD_POLICY_MESSAGES } from "@/lib/password-policy"

export const AUTH_ERROR_MESSAGES = {
  invalidCredentials:
    "That email and password combination doesn’t match an account.",
  emailNotConfirmed:
    "Confirm your email address before signing in. Check your inbox for the confirmation link.",
  alreadyRegistered:
    "An account with that email already exists. Try signing in instead.",
  weakPassword: "That password is too easy to guess. Choose a different one.",
  /** Per-address cooldown: one email per address per minute by default. */
  emailCooldown:
    "You’ve already requested this recently. Wait a minute before trying again.",
  /** Project-wide hourly cap on every email Auth sends. */
  emailLimit:
    "We can’t send email right now. Please try again in about an hour.",
  /** Per-IP cap on sign-up, sign-in and recovery requests. */
  requestLimit:
    "Too many attempts from this network. Wait a few minutes and try again.",
  /** Unclassified throttling, from a response without a code. */
  rateLimited: "Too many attempts. Wait a few minutes and try again.",
} as const

export interface AuthErrorLike {
  message: string
  /** `AuthError.code`, e.g. `over_email_send_rate_limit`. */
  code?: string | null
}

/** The 60-second per-address cooldown, not the project-wide email cap. */
function isPerAddressCooldown(message: string): boolean {
  return (
    message.includes("for security purposes") ||
    message.includes("you can only request this after")
  )
}

export function mapAuthError(error: AuthErrorLike): string {
  const message = error.message
  const lower = message.toLowerCase()
  const code = error.code ?? ""

  if (code === "over_request_rate_limit") {
    return AUTH_ERROR_MESSAGES.requestLimit
  }
  if (code === "over_email_send_rate_limit") {
    return isPerAddressCooldown(lower)
      ? AUTH_ERROR_MESSAGES.emailCooldown
      : AUTH_ERROR_MESSAGES.emailLimit
  }

  if (lower.includes("invalid login credentials")) {
    return AUTH_ERROR_MESSAGES.invalidCredentials
  }
  if (lower.includes("email not confirmed")) {
    return AUTH_ERROR_MESSAGES.emailNotConfirmed
  }
  if (lower.includes("user already registered")) {
    return AUTH_ERROR_MESSAGES.alreadyRegistered
  }
  if (lower.includes("password should be") || lower.includes("at least 10")) {
    return PASSWORD_POLICY_MESSAGES.too_short
  }
  if (
    lower.includes("weak") ||
    lower.includes("pwned") ||
    lower.includes("leaked")
  ) {
    return AUTH_ERROR_MESSAGES.weakPassword
  }
  // Older Auth versions answer 429 without a code; keep the cooldown apart so
  // the user isn't told to wait an hour for a one-minute wait.
  if (
    lower.includes("for security purposes") ||
    lower.includes("you can only request this after")
  ) {
    return AUTH_ERROR_MESSAGES.emailCooldown
  }
  if (lower.includes("email rate limit")) {
    return AUTH_ERROR_MESSAGES.emailLimit
  }
  if (lower.includes("rate limit") || lower.includes("too many")) {
    return AUTH_ERROR_MESSAGES.rateLimited
  }

  return message
}
