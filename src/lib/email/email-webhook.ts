/**
 * Signature check for Supabase Auth's Send Email Hook.
 *
 * HTTP hooks follow the Standard Webhooks spec: the request carries
 * `webhook-id`, `webhook-timestamp` and `webhook-signature`, and the signature
 * is `base64(HMAC-SHA256(secret, "id.timestamp.body"))`. Implementing the eight
 * lines here keeps a dependency out of the tree and makes the check unit
 * testable; the secret format (`v1,whsec_<base64>`) is the only tricky part.
 */

import { createHmac, timingSafeEqual } from "node:crypto"

/** Standard Webhooks recommends rejecting anything older than five minutes. */
export const SIGNATURE_TOLERANCE_SECONDS = 5 * 60

export interface HookHeaders {
  id: string | null
  timestamp: string | null
  signature: string | null
}

export type SignatureVerdict =
  | { ok: true }
  | { ok: false; reason: "missing_headers" | "stale_timestamp" | "bad_signature" }

/** Accepts `v1,whsec_<base64>`, `whsec_<base64>`, or the bare base64 secret. */
export function decodeHookSecret(raw: string): Buffer {
  const stripped = raw.trim().replace(/^v1,/, "").replace(/^whsec_/, "")
  return Buffer.from(stripped, "base64")
}

function matches(expected: string, provided: string): boolean {
  const a = Buffer.from(expected)
  const b = Buffer.from(provided)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export function verifyEmailHookSignature(input: {
  payload: string
  headers: HookHeaders
  secret: string
  /** Seconds since the epoch; injectable so tests do not depend on the clock. */
  nowSeconds?: number
  toleranceSeconds?: number
}): SignatureVerdict {
  const { payload, headers, secret } = input
  if (!headers.id || !headers.timestamp || !headers.signature) {
    return { ok: false, reason: "missing_headers" }
  }

  const timestamp = Number(headers.timestamp)
  if (!Number.isFinite(timestamp)) return { ok: false, reason: "bad_signature" }

  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000)
  const tolerance = input.toleranceSeconds ?? SIGNATURE_TOLERANCE_SECONDS
  if (Math.abs(now - timestamp) > tolerance) {
    return { ok: false, reason: "stale_timestamp" }
  }

  const key = decodeHookSecret(secret)
  if (key.length === 0) return { ok: false, reason: "bad_signature" }

  const expected = createHmac("sha256", key)
    .update(`${headers.id}.${headers.timestamp}.${payload}`)
    .digest("base64")

  // The header is a space-delimited list so secrets can be rotated; any match
  // is enough.
  const candidates = headers.signature
    .split(" ")
    .map((entry) => entry.replace(/^v1,/, ""))
    .filter(Boolean)

  if (candidates.some((candidate) => matches(expected, candidate))) {
    return { ok: true }
  }
  return { ok: false, reason: "bad_signature" }
}
