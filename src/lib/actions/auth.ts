"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import { getSiteUrl } from "@/lib/site-url"
import type { ActionResult } from "@/lib/action-result"
import { mapAuthError } from "@/lib/auth-errors"
import type { AuthResult } from "@/lib/form-results"
import { validateDisplayName } from "@/lib/validation"
import { checkPasswordPolicy } from "@/lib/password-policy"
import { isValidTimeZone, TIMEZONE_COOKIE } from "@/lib/timezone"

async function rememberTimeZone(timeZone?: string): Promise<void> {
  if (!timeZone || !isValidTimeZone(timeZone)) return
  const cookieStore = await cookies()
  cookieStore.set(TIMEZONE_COOKIE, timeZone, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  })
}

export async function signInAction(input: {
  email: string
  password: string
  timezone?: string
}): Promise<AuthResult> {
  const email = input.email.trim()
  if (!email || !input.password) {
    return { ok: false, error: "Enter your email and password." }
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: input.password,
  })

  if (error) {
    return { ok: false, error: mapAuthError(error) }
  }

  await rememberTimeZone(input.timezone)
  return { ok: true, data: {} }
}

export async function signUpAction(input: {
  role: "owner" | "caregiver"
  displayName: string
  householdName: string
  email: string
  password: string
  confirmPassword: string
  timezone?: string
}): Promise<AuthResult> {
  const displayName = input.displayName.trim()
  const nameError = validateDisplayName(displayName)
  if (nameError) return { ok: false, error: nameError }

  const email = input.email.trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Enter a valid email address." }
  }
  const passwordPolicy = checkPasswordPolicy(input.password, {
    email,
    displayName,
  })
  if (!passwordPolicy.ok) {
    return { ok: false, error: passwordPolicy.message }
  }
  if (input.password !== input.confirmPassword) {
    return { ok: false, error: "The passwords don’t match." }
  }

  const origin = await getSiteUrl()
  const next = input.role === "owner" ? "/dashboard" : "/join"

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.signUp({
    email,
    password: input.password,
    options: {
      data: {
        account_type: input.role,
        display_name: displayName,
        household_name: input.householdName.trim(),
      },
      emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(next)}`,
    },
  })

  if (error) {
    return { ok: false, error: mapAuthError(error) }
  }

  await rememberTimeZone(input.timezone)

  if (data.session) {
    // Confirmation is off for this project: the session already exists.
    return { ok: true, data: { redirectTo: next } }
  }

  // The waiting state lives at its own URL so a refresh or a shared link keeps
  // it. Only the address travels with it — never the password.
  const params = new URLSearchParams({ email, role: input.role })
  return {
    ok: true,
    data: { redirectTo: `/signup/check-email?${params.toString()}` },
  }
}

/**
 * Re-sends the sign-up confirmation link. The reply is deliberately identical
 * whether or not the address is registered, so this cannot be used to probe
 * for accounts; the 60-second cooldown in the panel and Auth's own per-address
 * throttle keep it from being a relay.
 */
export async function resendConfirmationAction(input: {
  email: string
  role?: "owner" | "caregiver"
}): Promise<AuthResult> {
  const email = input.email.trim()
  if (!email) return { ok: false, error: "Enter your email address." }

  const origin = await getSiteUrl()
  const next = input.role === "caregiver" ? "/join" : "/dashboard"
  const supabase = await createSupabaseServerClient()

  await supabase.auth.resend({
    type: "signup",
    email,
    options: {
      emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(next)}`,
    },
  })

  // Errors (unknown address, throttle) are intentionally not surfaced: any
  // difference in wording would reveal whether the address has an account.
  return {
    ok: true,
    data: {
      message:
        "If that address still needs confirming, a new email is on its way.",
    },
  }
}

export async function forgotPasswordAction(input: {
  email: string
}): Promise<AuthResult> {
  const email = input.email.trim()
  if (!email) return { ok: false, error: "Enter your email address." }

  const origin = await getSiteUrl()
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=${encodeURIComponent("/reset-password")}`,
  })

  if (error) {
    return { ok: false, error: mapAuthError(error) }
  }

  return {
    ok: true,
    data: {
      message:
        "If an account exists for that address, a reset link is on its way.",
    },
  }
}

export async function resetPasswordAction(input: {
  password: string
  confirmPassword: string
}): Promise<AuthResult> {
  if (input.password !== input.confirmPassword) {
    return { ok: false, error: "The passwords don’t match." }
  }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      ok: false,
      error: "This reset link has expired. Request a new one.",
    }
  }

  const metadata: { display_name?: unknown } = user.user_metadata
  const passwordPolicy = checkPasswordPolicy(input.password, {
    email: user.email ?? null,
    displayName:
      typeof metadata.display_name === "string" ? metadata.display_name : null,
  })
  if (!passwordPolicy.ok) {
    return { ok: false, error: passwordPolicy.message }
  }

  const { error } = await supabase.auth.updateUser({
    password: input.password,
  })

  if (error) {
    return { ok: false, error: mapAuthError(error) }
  }

  return { ok: true, data: { message: "Password updated. You can sign in now." } }
}

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  redirect("/login")
}

export async function setTimeZoneAction(
  timeZone: string,
): Promise<ActionResult> {
  await rememberTimeZone(timeZone)
  return { ok: true, data: null }
}

