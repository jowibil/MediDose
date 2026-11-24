import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/env"

/**
 * Cookie-aware server client for server components, actions, and route
 * handlers. Writes are wrapped because server components cannot set cookies;
 * middleware keeps the session refreshed in that case.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        } catch {
          // Called from a server component. Middleware refreshes the session.
        }
      },
    },
  })
}
