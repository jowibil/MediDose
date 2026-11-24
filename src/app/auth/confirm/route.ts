import type { EmailOtpType } from "@supabase/supabase-js"
import { redirect } from "next/navigation"

import { createSupabaseServerClient } from "@/lib/supabase/server"

function safeNext(value: string | null, fallback: string): string {
  if (!value) return fallback
  if (!value.startsWith("/") || value.startsWith("//")) return fallback
  return value
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type")
  const code = searchParams.get("code")
  const next = safeNext(searchParams.get("next"), "/dashboard")

  const supabase = await createSupabaseServerClient()

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as EmailOtpType,
      token_hash: tokenHash,
    })
    if (!error) redirect(next)
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) redirect(next)
  }

  redirect(
    `/login?error=${encodeURIComponent(
      "That confirmation link is invalid or has expired. Sign in to request a new one.",
    )}`,
  )
}
