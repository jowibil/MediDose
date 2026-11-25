import { describe, expect, it } from "vitest"

import { describeSendFailure } from "@/lib/email/smtp"

describe("describeSendFailure", () => {
  it("keeps the name and transport code, never the provider text", () => {
    const error = Object.assign(
      new Error(
        "Can't send mail - all recipients were rejected: 550 5.1.1 <alex@example.com>: Recipient address rejected",
      ),
      { code: "EENVELOPE" },
    )

    const detail = describeSendFailure(error)
    expect(detail).toEqual({ name: "Error", code: "EENVELOPE" })
    expect(JSON.stringify(detail)).not.toContain("@")
    expect(JSON.stringify(detail)).not.toContain("example.com")
  })

  it("handles a value that is not an Error", () => {
    expect(describeSendFailure("SMTP 550 <alex@example.com>")).toEqual({
      name: "UnknownError",
      code: null,
    })
  })
})
