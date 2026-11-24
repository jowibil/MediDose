import { describe, expect, it } from "vitest"

import { AUTH_ERROR_MESSAGES, mapAuthError } from "@/lib/auth-errors"
import { PASSWORD_POLICY_MESSAGES } from "@/lib/password-policy"

describe("mapAuthError", () => {
  it("separates the three 429 causes", () => {
    expect(
      mapAuthError({
        message: "email rate limit exceeded",
        code: "over_email_send_rate_limit",
      }),
    ).toBe(AUTH_ERROR_MESSAGES.emailLimit)

    expect(
      mapAuthError({
        message: "For security purposes, you can only request this after 43 seconds.",
        code: "over_email_send_rate_limit",
      }),
    ).toBe(AUTH_ERROR_MESSAGES.emailCooldown)

    expect(
      mapAuthError({
        message: "Request rate limit reached",
        code: "over_request_rate_limit",
      }),
    ).toBe(AUTH_ERROR_MESSAGES.requestLimit)
  })

  it("tells the three messages apart from each other", () => {
    const messages = [
      AUTH_ERROR_MESSAGES.emailLimit,
      AUTH_ERROR_MESSAGES.emailCooldown,
      AUTH_ERROR_MESSAGES.requestLimit,
    ]
    expect(new Set(messages).size).toBe(3)
  })

  it("keeps the cooldown short-wait copy for a 429 without a code", () => {
    expect(
      mapAuthError({
        message: "For security purposes, you can only request this after 60 seconds.",
      }),
    ).toBe(AUTH_ERROR_MESSAGES.emailCooldown)

    expect(mapAuthError({ message: "email rate limit exceeded" })).toBe(
      AUTH_ERROR_MESSAGES.emailLimit,
    )
    expect(mapAuthError({ message: "Request rate limit reached" })).toBe(
      AUTH_ERROR_MESSAGES.rateLimited,
    )
  })

  it("still maps the other Auth failures", () => {
    expect(
      mapAuthError({ message: "Invalid login credentials", code: "invalid_credentials" }),
    ).toBe(AUTH_ERROR_MESSAGES.invalidCredentials)
    expect(mapAuthError({ message: "Email not confirmed" })).toBe(
      AUTH_ERROR_MESSAGES.emailNotConfirmed,
    )
    expect(mapAuthError({ message: "User already registered" })).toBe(
      AUTH_ERROR_MESSAGES.alreadyRegistered,
    )
    expect(
      mapAuthError({ message: "Password should be at least 10 characters." }),
    ).toBe(PASSWORD_POLICY_MESSAGES.too_short)
    expect(
      mapAuthError({ message: "Password is known to be weak and easy to guess." }),
    ).toBe(AUTH_ERROR_MESSAGES.weakPassword)
  })

  it("never echoes the provider message for a classified error", () => {
    const providerText = "For security purposes, you can only request this after 60 seconds."
    expect(mapAuthError({ message: providerText })).not.toContain("security purposes")
  })
})
