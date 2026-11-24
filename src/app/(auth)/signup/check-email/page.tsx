import { redirect } from "next/navigation"

import { CheckEmailPanel } from "@/components/auth/check-email-panel"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export const metadata = { title: "Check your email" }

/**
 * The post-signup waiting state. It is a server-rendered route (not component
 * state) so a hard refresh — or opening the URL on another device — keeps
 * showing it. Only the address and the chosen role are in the URL.
 */
export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; role?: string }>
}) {
  const params = await searchParams

  // Someone who already confirmed and signed in has nothing to wait for.
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) redirect("/dashboard")

  const email =
    typeof params.email === "string" ? params.email.trim().slice(0, 254) : ""
  const role = params.role === "caregiver" ? "caregiver" : "owner"

  return <CheckEmailPanel email={email} role={role} />
}
