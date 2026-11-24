"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Check } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { joinHouseholdAction } from "@/lib/actions/household"

export function JoinForm() {
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [householdName, setHouseholdName] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  if (householdName) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="flex items-center gap-2 text-sm font-medium text-sage">
          <Check className="size-4" />
          You joined {householdName}.
        </p>
        <p className="text-sm text-muted-foreground">
          Its patients now appear in the top-bar selector.
        </p>
        <Button asChild>
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
      </div>
    )
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        setError(null)
        startTransition(async () => {
          const result = await joinHouseholdAction(code)
          if (!result.ok) {
            setError(result.error)
            return
          }
          setHouseholdName(result.data.householdName)
        })
      }}
    >
      <div>
        <Label htmlFor="invite-code" className="mb-1.5">
          Invite code
        </Label>
        <Input
          id="invite-code"
          value={code}
          maxLength={6}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="ABC234"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "invite-error" : "invite-help"}
          className="max-w-48 text-center font-mono text-lg tracking-[0.3em] uppercase"
          onChange={(event) => {
            const normalized = event.target.value
              .replace(/[^a-zA-Z0-9]/g, "")
              .toUpperCase()
              .slice(0, 6)
            setCode(normalized)
          }}
        />
        <p id="invite-help" className="mt-1 text-xs text-muted-foreground">
          Six characters, uppercase. Spaces and hyphens are ignored.
        </p>
      </div>

      {error ? (
        <p id="invite-error" role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={isPending || code.length !== 6}>
        {isPending ? "Joining…" : "Join household"}
      </Button>
    </form>
  )
}
