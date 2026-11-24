import { redirect } from "next/navigation"

import { createSupabaseServerClient } from "@/lib/supabase/server"

function safeNext(value: string | null, fallback: string): string {
  if (!value) return fallback
  if (!value.startsWith("/") || value.startsWith("//")) return fallback
  return value
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const next = safeNext(searchParams.get("next"), "/dashboard")

  if (!code) {
    redirect(
      `/login?error=${encodeURIComponent("That link is invalid or has expired.")}`,
    )
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    redirect(
      `/login?error=${encodeURIComponent("That link is invalid or has expired.")}`,
    )
  }

  redirect(next)
}
