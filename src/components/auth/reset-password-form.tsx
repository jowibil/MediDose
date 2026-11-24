"use client"

import { useState, useTransition } from "react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { PasswordInput, PasswordStrength } from "@/components/ui/password-input"
import { resetPasswordAction } from "@/lib/actions/auth"
import { PASSWORD_MIN_LENGTH } from "@/lib/password-policy"

export function ResetPasswordForm() {
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setMessage(null)
    startTransition(async () => {
      const result = await resetPasswordAction({ password, confirmPassword })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setMessage(result.data.message ?? "Password updated.")
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Choose a new password</CardTitle>
        <CardDescription>
          This link is only valid for a short time. Use at least{" "}
          {PASSWORD_MIN_LENGTH} characters.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
          <div>
            <Label htmlFor="new-password" className="mb-1.5">
              New password
            </Label>
            <PasswordInput
              id="new-password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <PasswordStrength password={password} />
          </div>
          <div>
            <Label htmlFor="new-password-confirm" className="mb-1.5">
              Confirm new password
            </Label>
            <PasswordInput
              id="new-password-confirm"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </div>

          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
          {message ? (
            <p role="status" className="text-xs text-sage-ink">
              {message}
            </p>
          ) : null}

          <Button type="submit" disabled={isPending || Boolean(message)}>
            {isPending ? "Saving…" : "Update password"}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
              Back to sign in
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
