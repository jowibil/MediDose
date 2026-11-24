"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createPatientAction } from "@/lib/actions/patients"

export function AddPatientForm({
  autoFocus = false,
  onCreated,
}: {
  autoFocus?: boolean
  onCreated?: (id: string) => void
}) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await createPatientAction(name)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setName("")
      onCreated?.(result.data.id)
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={name}
          autoFocus={autoFocus}
          onChange={(event) => setName(event.target.value)}
          placeholder="Patient name"
          aria-label="New patient name"
          aria-invalid={Boolean(error)}
          className="max-w-56"
        />
        <Button type="submit" disabled={isPending || !name.trim()}>
          <Plus className="size-4" />
          {isPending ? "Adding…" : "Add patient"}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  )
}
