import { cookies } from "next/headers"

export const TIMEZONE_COOKIE = "md_tz"

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone })
    return true
  } catch {
    return false
  }
}

/** The browser-selected IANA timezone; defaults to UTC. Server-only. */
export async function getTimeZone(): Promise<string> {
  const cookieStore = await cookies()
  const value = cookieStore.get(TIMEZONE_COOKIE)?.value
  if (!value || !isValidTimeZone(value)) return "UTC"
  return value
}
