import { describe, expect, it } from "vitest"

import {
  checkPasswordPolicy,
  passwordByteLength,
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_LENGTH,
} from "@/lib/password-policy"

const STRONG = "Kf7-tram-9Q"

function repeated(unit: string, length: number): string {
  return unit.repeat(Math.ceil(length / unit.length)).slice(0, length)
}

function codesFor(password: string, context = {}): string[] {
  return checkPasswordPolicy(password, context).codes
}

describe("checkPasswordPolicy", () => {
  it("accepts a strong password and exposes no message", () => {
    const result = checkPasswordPolicy(STRONG)
    expect(result.ok).toBe(true)
    expect(result.codes).toEqual([])
    expect(result.message).toBeNull()
  })

  it("has the documented bounds", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(10)
    expect(PASSWORD_MAX_BYTES).toBe(72)
  })

  it("rejects boundaries at 9 and accepts 10 characters", () => {
    const nine = "Vq7#mWx2!"
    expect(nine).toHaveLength(9)
    expect(codesFor(nine)).toEqual(["too_short"])

    const ten = "Vq7#mWx2!a"
    expect(ten).toHaveLength(10)
    expect(checkPasswordPolicy(ten).ok).toBe(true)
  })

  it("treats an empty password as too short", () => {
    expect(codesFor("")).toContain("too_short")
  })

  it("accepts exactly 72 bytes and rejects 73", () => {
    const atLimit = repeated("Kx7-", 72)
    expect(atLimit).toHaveLength(72)
    expect(passwordByteLength(atLimit)).toBe(72)
    expect(checkPasswordPolicy(atLimit).ok).toBe(true)

    const overLimit = `${atLimit}z`
    expect(passwordByteLength(overLimit)).toBe(73)
    expect(codesFor(overLimit)).toEqual(["too_long"])
  })

  it("counts UTF-8 bytes, not characters, near the limit", () => {
    // "é" is 2 bytes: 70 ASCII chars + é = 72 bytes but only 71 characters.
    const twoByteAtLimit = `${repeated("Kx7-", 70)}é`
    expect(Array.from(twoByteAtLimit)).toHaveLength(71)
    expect(passwordByteLength(twoByteAtLimit)).toBe(72)
    expect(checkPasswordPolicy(twoByteAtLimit).ok).toBe(true)

    // 71 ASCII chars + é = 73 bytes while still being 72 characters.
    const twoByteOver = `${repeated("Kx7-", 71)}é`
    expect(Array.from(twoByteOver)).toHaveLength(72)
    expect(passwordByteLength(twoByteOver)).toBe(73)
    expect(codesFor(twoByteOver)).toEqual(["too_long"])

    // Three-byte characters: 69 ASCII + one CJK char = 72 bytes.
    const threeByteAtLimit = `${repeated("Kx7-", 69)}密`
    expect(passwordByteLength(threeByteAtLimit)).toBe(72)
    expect(checkPasswordPolicy(threeByteAtLimit).ok).toBe(true)
  })

  it("rejects common passwords case-insensitively", () => {
    expect(codesFor("Qwertyuiop")).toContain("too_common")
    expect(codesFor("qwertyuiop")).toContain("too_common")
    expect(codesFor("QWERTYUIOP")).toContain("too_common")
    expect(codesFor("MediDose")).toContain("too_common")
    expect(codesFor("PaSsWoRd123")).toContain("too_common")
  })

  it("rejects the email local part and the display name", () => {
    const context = {
      email: "alex.rivera@example.com",
      displayName: "Alex Rivera",
    }
    expect(codesFor("Kf7-rivera-x2", context)).toEqual(["contains_identity"])
    expect(codesFor("Kf7-Alex-x2", context)).toEqual(["contains_identity"])
    expect(codesFor("Rivera-Kw7-2026", { displayName: "Alex Rivera" })).toEqual(
      ["contains_identity"],
    )
    // Identity checks must not reject unrelated passwords.
    expect(checkPasswordPolicy(STRONG, context).ok).toBe(true)
  })

  it("ignores identity tokens shorter than three characters", () => {
    expect(checkPasswordPolicy(STRONG, { email: "a@b.co", displayName: "Al" }).ok).toBe(
      true,
    )
  })

  it("rejects a single repeated or sequential run", () => {
    expect(codesFor("aaaaaaaaaaaa")).toEqual(["low_variety"])
    expect(codesFor("9876543210")).toEqual(["low_variety"])
    expect(codesFor("zyxwvutsrq")).toEqual(["low_variety"])
    expect(codesFor(STRONG)).not.toContain("low_variety")
  })

  it("returns every applicable code with a user-safe message", () => {
    const result = checkPasswordPolicy("password", {
      email: "password@example.com",
    })
    expect(result.ok).toBe(false)
    expect(result.codes).toContain("too_short")
    expect(result.codes).toContain("too_common")
    if (result.ok) throw new Error("expected a failure")
    expect(result.message.length).toBeGreaterThan(0)
    expect(result.message).not.toContain("password")
    expect(Object.values(result)).not.toContain("password")
  })
})
