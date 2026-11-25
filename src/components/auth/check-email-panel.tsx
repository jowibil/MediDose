"use client"

import { useEffect, useState, useTransition } from "react"
import Link from "next/link"
import { MailCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { resendConfirmationAction } from "@/lib/actions/auth"

const COOLDOWN_SECONDS = 60

export function CheckEmailPanel({
  email,
  role,
}: {
  email: string
  role: "owner" | "caregiver" | "patient"
}) {
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const cooling = secondsLeft > 0

  // Tick only while the cooldown runs; nothing is written to browser storage,
  // so a refresh cannot reveal or resurrect anything about the account.
  useEffect(() => {
    if (!cooling) return
    const timer = window.setInterval(() => {
      setSecondsLeft((current) => (current <= 1 ? 0 : current - 1))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [cooling])

  function handleResend() {
    if (!email || cooling || isPending) return
    setError(null)
    setNotice(null)

    startTransition(async () => {
      const result = await resendConfirmationAction({ email, role })

      // Start the cooldown whatever the provider said: repeating the request
      // within a minute cannot help, and the wording must not change with it.
      setSecondsLeft(COOLDOWN_SECONDS)

      if (!result.ok) {
        setError(result.error)
        return
      }
      setNotice(
        result.data.message ??
          "If that address still needs confirming, a new email is on its way.",
      )
    })
  }

  const signupHref =
    role === "caregiver"
      ? "/signup?role=caregiver"
      : role === "patient"
        ? "/signup?role=patient"
        : "/signup"

  return (
    <Card>
      <CardHeader>
        <div className="mb-1 flex size-10 items-center justify-center rounded-xl bg-sage-soft text-sage-ink">
          <MailCheck className="size-5" aria-hidden />
        </div>
        <CardTitle>Check your email</CardTitle>
        <CardDescription>
          {email ? (
            <>
              We sent a confirmation link to{" "}
              <span className="font-medium text-foreground">{email}</span>.
            </>
          ) : (
            "We sent you a confirmation link."
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Open the link to confirm your address. It works once and expires in
            an hour.
            {role === "caregiver"
              ? " After confirming, sign in and join your household with the invite code."
              : role === "patient"
                ? " After confirming, sign in and enter the link code your household owner gave you."
                : " After confirming, sign in to set up your household."}
          </p>

          {notice ? (
            <p
              role="status"
              aria-live="polite"
              className="rounded-xl border border-sage/30 bg-sage-soft/60 p-3 text-xs text-sage-ink"
            >
              {notice}
            </p>
          ) : null}

          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}

          {email ? (
            <Button
              type="button"
              variant="outline"
              onClick={handleResend}
              disabled={isPending || cooling}
              aria-busy={isPending}
            >
              {isPending
                ? "Sending…"
                : cooling
                  ? `Resend in ${secondsLeft}s`
                  : "Resend confirmation email"}
            </Button>
          ) : (
            <Button asChild variant="outline">
              <Link href={signupHref}>Start signup again</Link>
            </Button>
          )}

          <p className="text-center text-xs text-muted-foreground">
            Already confirmed?{" "}
            <Link
              href="/login"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Sign in
            </Link>
            {" · "}
            <Link
              href={signupHref}
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Use a different email
            </Link>
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
