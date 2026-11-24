"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Check, Home, UserRound } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PasswordInput, PasswordStrength } from "@/components/ui/password-input"
import { cn } from "@/lib/utils"
import { signUpAction } from "@/lib/actions/auth"
import { PASSWORD_MIN_LENGTH } from "@/lib/password-policy"

type Role = "owner" | "caregiver"

export function SignupForm({ initialRole = "owner" }: { initialRole?: Role }) {
  const router = useRouter()
  const [role, setRole] = useState<Role>(initialRole)
  const [displayName, setDisplayName] = useState("")
  const [householdName, setHouseholdName] = useState("")
  const [email, setEmail] = useState("")
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
      const result = await signUpAction({
        role,
        displayName,
        householdName,
        email,
        password,
        confirmPassword,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      })

      if (!result.ok) {
        setError(result.error)
        return
      }

      if (result.data.message === "Account created.") {
        router.push(role === "owner" ? "/dashboard" : "/join")
        router.refresh()
        return
      }

      setMessage(result.data.message ?? "Check your email to confirm your account.")
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>
          Choose how you’ll use MediDose. Roles can’t be changed later.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-5 grid gap-2 sm:grid-cols-2">
          <RoleOption
            active={role === "owner"}
            icon={<Home className="size-4" />}
            title="Create a household"
            description="Manage patients, medicines, and caregivers."
            onClick={() => setRole("owner")}
          />
          <RoleOption
            active={role === "caregiver"}
            icon={<UserRound className="size-4" />}
            title="Join a household"
            description="Help with doses and restocking with an invite code."
            onClick={() => setRole("caregiver")}
          />
        </div>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
          <div>
            <Label htmlFor="display-name" className="mb-1.5">
              Your name
            </Label>
            <Input
              id="display-name"
              autoComplete="name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </div>

          {role === "owner" ? (
            <div>
              <Label htmlFor="household-name" className="mb-1.5">
                Household name (optional)
              </Label>
              <Input
                id="household-name"
                placeholder="e.g. The Rivera household"
                value={householdName}
                onChange={(event) => setHouseholdName(event.target.value)}
              />
            </div>
          ) : null}

          <div>
            <Label htmlFor="signup-email" className="mb-1.5">
              Email
            </Label>
            <Input
              id="signup-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="signup-password" className="mb-1.5">
                Password
              </Label>
              <PasswordInput
                id="signup-password"
                autoComplete="new-password"
                aria-describedby="signup-password-hint"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              {password ? null : (
                <p
                  id="signup-password-hint"
                  className="mt-1.5 text-[11px] text-muted-foreground"
                >
                  At least {PASSWORD_MIN_LENGTH} characters.
                </p>
              )}
              <PasswordStrength
                password={password}
                email={email}
                displayName={displayName}
              />
            </div>
            <div>
              <Label htmlFor="signup-confirm" className="mb-1.5">
                Confirm password
              </Label>
              <PasswordInput
                id="signup-confirm"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </div>
          </div>

          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}

          {message ? (
            <p
              role="status"
              className="rounded-xl border border-sage/30 bg-sage-soft/60 p-3 text-xs text-sage-ink"
            >
              {message}
            </p>
          ) : null}

          <Button type="submit" disabled={isPending || Boolean(message)}>
            {isPending
              ? "Creating account…"
              : role === "owner"
                ? "Create household account"
                : "Create caregiver account"}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  )
}

function RoleOption({
  active,
  icon,
  title,
  description,
  onClick,
}: {
  active: boolean
  icon: React.ReactNode
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex flex-col gap-1 rounded-2xl border p-3 text-left transition-colors",
        active
          ? "border-primary bg-primary/5"
          : "border-border/60 hover:border-border hover:bg-muted/30",
      )}
    >
      <span className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-medium">
          {icon}
          {title}
        </span>
        {active ? <Check className="size-4 text-sage" /> : null}
      </span>
      <span className="text-xs text-muted-foreground">{description}</span>
    </button>
  )
}
