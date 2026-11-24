/**
 * The one place that decides MediDose's public origin.
 *
 * Auth emails are built from absolute URLs, so the origin must be stable even
 * when the request that triggers the email arrives through a proxy. Resolution
 * order:
 *
 * 1. `NEXT_PUBLIC_SITE_URL` — explicit configuration, required in production.
 * 2. Vercel's forwarded host (`x-forwarded-host` + `x-forwarded-proto`).
 * 3. `VERCEL_URL` — the deployment host Vercel injects (preview builds).
 * 4. The plain `Host` header, for a host that sets no forwarded headers.
 * 5. `http://localhost:3000` — local development only.
 *
 * `resolveSiteUrl` is pure so the order is unit tested; `getSiteUrl` adds the
 * request headers. Every auth redirect URL goes through it — do not rebuild
 * origins elsewhere.
 */

import { getConfiguredSiteUrl } from "@/lib/env"

const LOCAL_FALLBACK = "http://localhost:3000"

export interface SiteUrlSources {
  /** `NEXT_PUBLIC_SITE_URL`, with or without a scheme. */
  siteUrl?: string | null
  /** `VERCEL_URL`, which is host-only (`my-app-abc123.vercel.app`). */
  vercelUrl?: string | null
  /** `x-forwarded-host`; may be a comma-separated proxy chain. */
  forwardedHost?: string | null
  /** `x-forwarded-proto`; may also be a list. */
  forwardedProto?: string | null
  /** Direct `Host` header. */
  host?: string | null
}

function firstValue(value: string | null | undefined): string | null {
  const first = value?.split(",")[0]?.trim()
  return first ? first : null
}

/**
 * Returns a bare `scheme://host[:port]` origin, or null when the value is not a
 * usable http(s) URL. Host-only values (Vercel, `Host`) are assumed https.
 */
function normalizeOrigin(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null

  const candidate = trimmed.includes("://") ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(candidate)
    if (url.protocol !== "https:" && url.protocol !== "http:") return null
    if (!url.hostname) return null
    return url.origin
  } catch {
    return null
  }
}

function protocolFor(proto: string | null): "http" | "https" {
  return proto?.toLowerCase() === "http" ? "http" : "https"
}

function isLoopback(host: string): boolean {
  return (
    host.startsWith("localhost") ||
    host.startsWith("127.0.0.1") ||
    host.startsWith("[::1]")
  )
}

export function resolveSiteUrl(sources: SiteUrlSources = {}): string {
  const configured = normalizeOrigin(sources.siteUrl)
  if (configured) return configured

  const forwardedHost = firstValue(sources.forwardedHost)
  if (forwardedHost) {
    const origin = normalizeOrigin(
      `${protocolFor(firstValue(sources.forwardedProto))}://${forwardedHost}`,
    )
    if (origin) return origin
  }

  const vercel = normalizeOrigin(sources.vercelUrl)
  if (vercel) return vercel

  const host = firstValue(sources.host)
  if (host) {
    const origin = normalizeOrigin(
      `${isLoopback(host) ? "http" : "https"}://${host}`,
    )
    if (origin) return origin
  }

  return LOCAL_FALLBACK
}

/**
 * The origin of the current request, for links we put in an email. Server-only:
 * reads `next/headers` lazily so the pure resolver stays testable in Node.
 */
export async function getSiteUrl(): Promise<string> {
  const { headers } = await import("next/headers")
  const headerStore = await headers()

  return resolveSiteUrl({
    siteUrl: getConfiguredSiteUrl(),
    vercelUrl: process.env.VERCEL_URL,
    forwardedHost: headerStore.get("x-forwarded-host"),
    forwardedProto: headerStore.get("x-forwarded-proto"),
    host: headerStore.get("host"),
  })
}
