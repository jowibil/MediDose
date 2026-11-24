"use client"

import * as React from "react"
import { Eye, EyeOff } from "lucide-react"

import { Input } from "@/components/ui/input"
import {
  checkPasswordPolicy,
  PASSWORD_MIN_LENGTH,
  type PasswordPolicyContext,
} from "@/lib/password-policy"
import { cn } from "@/lib/utils"

export function PasswordInput({
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "type">) {
  const [visible, setVisible] = React.useState(false)

  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? "text" : "password"}
        className={cn("pr-11", className)}
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? "Hide characters" : "Show characters"}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {visible ? (
          <EyeOff className="size-4" aria-hidden />
        ) : (
          <Eye className="size-4" aria-hidden />
        )}
      </button>
    </div>
  )
}

const STRENGTH_LABELS = ["Weak", "Fair", "Good", "Strong"] as const

function scorePassword(value: string): number {
  if (value.length < PASSWORD_MIN_LENGTH) return 0
  let score = 1
  if (value.length >= 12) score += 1
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1
  if (/\d/.test(value)) score += 1
  if (/[^A-Za-z0-9]/.test(value)) score += 1
  return Math.min(score, 4)
}

export function PasswordStrength({
  password,
  email,
  displayName,
}: { password: string } & PasswordPolicyContext) {
  if (!password) return null

  const policy = checkPasswordPolicy(password, { email, displayName })
  const score = scorePassword(password)
  const tooShort = policy.codes.includes("too_short")
  const label = STRENGTH_LABELS[Math.max(score - 1, 0)]

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2">
        <div aria-hidden className="flex flex-1 gap-1">
          {[0, 1, 2, 3].map((index) => (
            <span
              key={index}
              className={cn(
                "h-1.5 flex-1 rounded-full",
                index < Math.max(score, 1) ? "bg-sage" : "bg-border",
              )}
            />
          ))}
        </div>
        <span className="w-16 text-right text-[11px] text-muted-foreground">
          {tooShort ? "Too short" : label}
        </span>
      </div>
      <p aria-live="polite" className="sr-only">
        {policy.ok
          ? `Password strength: ${label}.`
          : `Password needs changes. ${policy.message}`}
      </p>
      {policy.ok ? null : (
        <p className="mt-1 text-[11px] text-muted-foreground">
          {policy.message}
        </p>
      )}
    </div>
  )
}
