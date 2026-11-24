import { describe, expect, it } from "vitest"

import {
  isAuthEmailPayload,
  renderAuthEmails,
  type AuthEmailPayload,
} from "./templates"

const SITE = "https://medi-dose-1.vercel.app"

function payload(overrides: {
  action: string
  email?: string
  newEmail?: string | null
  redirectTo?: string
  displayName?: string
  tokenHash?: string
  tokenHashNew?: string | null
  token?: string
}): AuthEmailPayload {
  return {
    user: {
      email: overrides.email ?? "owner@example.com",
      new_email: overrides.newEmail ?? null,
      user_metadata: { display_name: overrides.displayName ?? "Ada" },
    },
    email_data: {
      token: overrides.token ?? "123456",
      token_hash: overrides.tokenHash ?? "hash-current",
      redirect_to: overrides.redirectTo ?? `${SITE}/auth/confirm?next=%2Fdashboard`,
      email_action_type: overrides.action,
      site_url: SITE,
      token_new: null,
      token_hash_new: overrides.tokenHashNew ?? null,
    },
  }
}

function firstLink(text: string): URL {
  const match = text.match(/https?:\/\/\S+/)
  if (!match) throw new Error("no link in email body")
  return new URL(match[0])
}

describe("renderAuthEmails", () => {
  it("sends a confirmation link for signup to the registered address", () => {
    const [email] = renderAuthEmails(payload({ action: "signup" }))
    expect(email?.to).toBe("owner@example.com")
    expect(email?.subject).toBe("Confirm your email for MediDose")

    const link = firstLink(email!.text)
    expect(link.pathname).toBe("/auth/confirm")
    expect(link.origin).toBe(SITE)
    expect(link.searchParams.get("token_hash")).toBe("hash-current")
    expect(link.searchParams.get("type")).toBe("email")
    expect(link.searchParams.get("next")).toBe("/dashboard")
  })

  it("keeps the reset destination on recovery links", () => {
    const [email] = renderAuthEmails(
      payload({
        action: "recovery",
        redirectTo: `${SITE}/auth/callback?next=%2Freset-password`,
      }),
    )
    const link = firstLink(email!.text)
    expect(link.searchParams.get("type")).toBe("recovery")
    expect(link.searchParams.get("next")).toBe("/reset-password")
  })

  it("defaults the recovery destination when the redirect carries no next", () => {
    const [email] = renderAuthEmails(payload({ action: "recovery" }))
    const link = firstLink(email!.text)
    expect(link.searchParams.get("next")).toBe("/reset-password")
  })

  it("escapes user-controlled names in the HTML", () => {
    const [email] = renderAuthEmails(
      payload({ action: "signup", displayName: "<script>alert(1)</script>" }),
    )
    expect(email!.html).not.toContain("<script>")
    expect(email!.html).toContain("&lt;script&gt;")
  })

  it("renders two emails for a secure email change, one per address", () => {
    const emails = renderAuthEmails(
      payload({
        action: "email_change",
        email: "old@example.com",
        newEmail: "new@example.com",
        tokenHash: "hash-new",
        tokenHashNew: "hash-old",
      }),
    )

    expect(emails).toHaveLength(2)
    const byTo = new Map(emails.map((email) => [email.to, email]))

    // The `_new` hash belongs to the current address (Supabase quirk).
    const approval = firstLink(byTo.get("old@example.com")!.text)
    expect(approval.searchParams.get("token_hash")).toBe("hash-old")
    expect(approval.searchParams.get("type")).toBe("email_change")

    const confirmation = firstLink(byTo.get("new@example.com")!.text)
    expect(confirmation.searchParams.get("token_hash")).toBe("hash-new")
  })

  it("sends a code instead of a link for reauthentication", () => {
    const [email] = renderAuthEmails(
      payload({ action: "reauthentication", token: "481920" }),
    )
    expect(email!.text).toContain("481920")
    expect(email!.text).not.toMatch(/https?:\/\//)
    expect(email!.html).not.toContain("/auth/confirm")
  })

  it("falls back to a working link for an unknown action", () => {
    const [email] = renderAuthEmails(payload({ action: "something_new" }))
    expect(firstLink(email!.text).pathname).toBe("/auth/confirm")
  })
})

describe("isAuthEmailPayload", () => {
  it("requires the fields the route reads", () => {
    expect(isAuthEmailPayload(payload({ action: "signup" }))).toBe(true)
    expect(isAuthEmailPayload({ user: {}, email_data: {} })).toBe(false)
    expect(isAuthEmailPayload(null)).toBe(false)
    expect(isAuthEmailPayload("nope")).toBe(false)
  })
})
