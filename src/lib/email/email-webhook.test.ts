import { createHmac } from "node:crypto"

import { describe, expect, it } from "vitest"

import { decodeHookSecret, verifyEmailHookSignature } from "./email-webhook"

const SECRET_BASE64 = Buffer.from("medidose-test-signing-key").toString("base64")
const SECRET = `v1,whsec_${SECRET_BASE64}`
const PAYLOAD = JSON.stringify({ user: { email: "owner@example.com" } })
const NOW = 1_780_000_000

function sign(
  payload: string,
  id: string,
  timestamp: string,
  secret = SECRET,
): string {
  return createHmac("sha256", decodeHookSecret(secret))
    .update(`${id}.${timestamp}.${payload}`)
    .digest("base64")
}

function headers(overrides: Partial<Record<"id" | "timestamp" | "signature", string | null>> = {}) {
  const id = "msg_123"
  const timestamp = String(NOW)
  return {
    id: overrides.id === undefined ? id : overrides.id,
    timestamp: overrides.timestamp === undefined ? timestamp : overrides.timestamp,
    signature:
      overrides.signature === undefined ? `v1,${sign(PAYLOAD, id, timestamp)}` : overrides.signature,
  }
}

describe("decodeHookSecret", () => {
  it("strips the version and symmetric prefixes", () => {
    expect(decodeHookSecret(SECRET).toString()).toBe("medidose-test-signing-key")
  })

  it("accepts the bare base64 secret", () => {
    expect(decodeHookSecret(SECRET_BASE64).toString()).toBe(
      "medidose-test-signing-key",
    )
  })
})

describe("verifyEmailHookSignature", () => {
  it("accepts a correctly signed, fresh request", () => {
    expect(
      verifyEmailHookSignature({
        payload: PAYLOAD,
        headers: headers(),
        secret: SECRET,
        nowSeconds: NOW,
      }),
    ).toEqual({ ok: true })
  })

  it("accepts a match anywhere in the space-delimited list", () => {
    const valid = sign(PAYLOAD, "msg_123", String(NOW))
    expect(
      verifyEmailHookSignature({
        payload: PAYLOAD,
        headers: headers({ signature: `v1,bm90LXRoZS1yaWdodC1vbmU= v1,${valid}` }),
        secret: SECRET,
        nowSeconds: NOW,
      }),
    ).toEqual({ ok: true })
  })

  it("rejects a tampered payload", () => {
    expect(
      verifyEmailHookSignature({
        payload: `${PAYLOAD} `,
        headers: headers(),
        secret: SECRET,
        nowSeconds: NOW,
      }),
    ).toEqual({ ok: false, reason: "bad_signature" })
  })

  it("rejects a request signed with another secret", () => {
    const other = `v1,whsec_${Buffer.from("some-other-key").toString("base64")}`
    expect(
      verifyEmailHookSignature({
        payload: PAYLOAD,
        headers: headers({ signature: `v1,${sign(PAYLOAD, "msg_123", String(NOW), other)}` }),
        secret: SECRET,
        nowSeconds: NOW,
      }),
    ).toEqual({ ok: false, reason: "bad_signature" })
  })

  it("rejects a timestamp outside the tolerance window", () => {
    expect(
      verifyEmailHookSignature({
        payload: PAYLOAD,
        headers: headers(),
        secret: SECRET,
        nowSeconds: NOW + 5 * 60 + 1,
      }),
    ).toEqual({ ok: false, reason: "stale_timestamp" })
  })

  it("rejects a request without the signature headers", () => {
    expect(
      verifyEmailHookSignature({
        payload: PAYLOAD,
        headers: headers({ signature: null }),
        secret: SECRET,
        nowSeconds: NOW,
      }),
    ).toEqual({ ok: false, reason: "missing_headers" })
  })
})
