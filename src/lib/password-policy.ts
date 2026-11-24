/**
 * The one password policy for MediDose.
 *
 * Deterministic hard rules, not a score. The visual 4-segment meter in
 * `src/components/ui/password-input.tsx` imports this module for its hard-rule
 * feedback so the rules are never duplicated.
 *
 * Supabase Auth enforces the length rule independently (see
 * `auth.minimum_password_length` in `supabase/config.jsonc`) because the Auth
 * API can be called directly with the anon key; the server actions call this
 * module because Auth cannot know names, emails, or our common-password list.
 *
 * Pure: no React, no I/O, and the password is never logged or echoed back.
 */

export const PASSWORD_MIN_LENGTH = 10
/**
 * bcrypt ignores input past 72 bytes, so anything longer would be silently
 * truncated. Counted in UTF-8 bytes, not characters.
 */
export const PASSWORD_MAX_BYTES = 72

export type PasswordPolicyCode =
  | "too_short"
  | "too_long"
  | "too_common"
  | "contains_identity"
  | "low_variety"

export interface PasswordPolicyIssue {
  code: PasswordPolicyCode
  message: string
}

export interface PasswordPolicyContext {
  /** The address being signed up or the signed-in user's address. */
  email?: string | null
  /** The account's display name, when known. */
  displayName?: string | null
}

export type PasswordPolicyResult =
  | {
      ok: true
      codes: PasswordPolicyCode[]
      issues: PasswordPolicyIssue[]
      message: null
    }
  | {
      ok: false
      codes: PasswordPolicyCode[]
      issues: PasswordPolicyIssue[]
      message: string
    }

export const PASSWORD_POLICY_MESSAGES: Record<PasswordPolicyCode, string> = {
  too_short: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
  too_long: `Keep your password to ${PASSWORD_MAX_BYTES} bytes or fewer. Accented letters and emoji use more than one byte.`,
  too_common:
    "That password is too common. Choose something less predictable.",
  contains_identity:
    "Don’t include your name or email address in your password.",
  low_variety: "Avoid passwords made of one repeated or sequential character.",
}

/** Deliberately small, lowercase, and hand-picked — not a breach corpus. */
const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password12",
  "password123",
  "password1234",
  "passw0rd",
  "p@ssw0rd",
  "123456789",
  "1234567890",
  "qwertyuiop",
  "qwerty123",
  "qwerty1234",
  "qwerty12345",
  "letmein123",
  "iloveyou1",
  "welcome123",
  "admin12345",
  "abc123456",
  "abcdefghij",
  "baseball12",
  "football12",
  "sunshine12",
  "princess12",
  "medidose",
  "medidose123",
  "medidose2026",
])

/** UTF-8 length, which is what bcrypt truncates at 72. */
export function passwordByteLength(value: string): number {
  return new TextEncoder().encode(value).length
}

function identityTokens(context: PasswordPolicyContext): string[] {
  const tokens: string[] = []

  const localPart = context.email?.trim().split("@")[0]
  if (localPart) tokens.push(localPart)

  const displayName = context.displayName?.trim()
  if (displayName) {
    tokens.push(displayName)
    tokens.push(...displayName.split(/\s+/))
  }

  return tokens
    .map((token) => token.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ""))
    .filter((token) => token.length >= 3)
}

/** One repeated character ("aaaaaaaaaa") or one step-1 run ("9876543210"). */
function isSingleRun(value: string): boolean {
  const points = Array.from(value, (char) => char.codePointAt(0) ?? 0)
  if (points.length < 3) return false

  const first = points[0]
  const second = points[1]
  if (first === undefined || second === undefined) return false

  if (points.every((point) => point === first)) return true

  const step = second - first
  if (Math.abs(step) !== 1) return false

  let previous = first
  for (const point of points.slice(1)) {
    if (point - previous !== step) return false
    previous = point
  }
  return true
}

/**
 * Checks a candidate password against every hard rule and returns all issues
 * (stable order: length, common, identity, variety). The first issue's message
 * is safe to show to the user.
 */
export function checkPasswordPolicy(
  password: string,
  context: PasswordPolicyContext = {},
): PasswordPolicyResult {
  const issues: PasswordPolicyIssue[] = []

  const characters = Array.from(password).length
  if (characters < PASSWORD_MIN_LENGTH) {
    issues.push({
      code: "too_short",
      message: PASSWORD_POLICY_MESSAGES.too_short,
    })
  }
  if (passwordByteLength(password) > PASSWORD_MAX_BYTES) {
    issues.push({ code: "too_long", message: PASSWORD_POLICY_MESSAGES.too_long })
  }

  const lower = password.toLowerCase()
  if (COMMON_PASSWORDS.has(lower)) {
    issues.push({
      code: "too_common",
      message: PASSWORD_POLICY_MESSAGES.too_common,
    })
  }

  const normalizedPassword = lower.replace(/[^\p{L}\p{N}]+/gu, "")
  if (identityTokens(context).some((token) => normalizedPassword.includes(token))) {
    issues.push({
      code: "contains_identity",
      message: PASSWORD_POLICY_MESSAGES.contains_identity,
    })
  }

  if (isSingleRun(password)) {
    issues.push({
      code: "low_variety",
      message: PASSWORD_POLICY_MESSAGES.low_variety,
    })
  }

  const codes = issues.map((issue) => issue.code)
  if (issues.length === 0) {
    return { ok: true, codes, issues, message: null }
  }

  return {
    ok: false,
    codes,
    issues,
    message: issues[0]?.message ?? "Choose a different password.",
  }
}
