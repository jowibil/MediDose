"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

import { setTimeZoneAction } from "@/lib/actions/auth"

/**
 * Keeps the server's `md_tz` cookie aligned with the browser so "today",
 * schedule slots, and restock-by labels follow the viewer's local day (D9).
 */
export function TimezoneSync({ current }: { current: string }) {
  const router = useRouter()

  useEffect(() => {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (detected && detected !== current) {
      void setTimeZoneAction(detected).then((result) => {
        if (result.ok) router.refresh()
      })
    }
  }, [current, router])

  return null
}
