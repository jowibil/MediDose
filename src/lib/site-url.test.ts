import { describe, expect, it } from "vitest"

import { resolveSiteUrl } from "./site-url"

describe("resolveSiteUrl", () => {
  it("prefers the explicit site URL and keeps only its origin", () => {
    expect(
      resolveSiteUrl({
        siteUrl: "https://medidose.example/app?ignored=1",
        forwardedHost: "internal-host:3000",
        forwardedProto: "http",
      }),
    ).toBe("https://medidose.example")
  })

  it("falls back to Vercel's forwarded headers when no env var is set", () => {
    expect(
      resolveSiteUrl({
        forwardedHost: "medi-dose-git-main-vince.vercel.app",
        forwardedProto: "https",
      }),
    ).toBe("https://medi-dose-git-main-vince.vercel.app")
  })

  it("accepts a forwarded proxy chain and an http preview origin", () => {
    expect(
      resolveSiteUrl({
        forwardedHost: "127.0.0.1:3222, proxy.internal",
        forwardedProto: "http, http",
      }),
    ).toBe("http://127.0.0.1:3222")
  })

  it("uses VERCEL_URL when the request carries no forwarded host", () => {
    expect(resolveSiteUrl({ vercelUrl: "medi-dose-abc123.vercel.app" })).toBe(
      "https://medi-dose-abc123.vercel.app",
    )
  })

  it("trusts a plain localhost Host header as http", () => {
    expect(resolveSiteUrl({ host: "localhost:3000" })).toBe(
      "http://localhost:3000",
    )
  })

  it("falls back to localhost for local development", () => {
    expect(resolveSiteUrl()).toBe("http://localhost:3000")
  })

  it("ignores a configured value that is not a usable URL", () => {
    expect(resolveSiteUrl({ siteUrl: "not a url" })).toBe(
      "http://localhost:3000",
    )
    expect(resolveSiteUrl({ siteUrl: "javascript:alert(1)" })).toBe(
      "http://localhost:3000",
    )
  })
})
