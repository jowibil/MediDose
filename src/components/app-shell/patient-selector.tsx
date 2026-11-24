"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { UserRound } from "lucide-react"

import type { ActivePatient } from "@/lib/auth"
import type { HouseholdGroup } from "@/types/medicine"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { setActivePatientAction } from "@/lib/actions/patients"

export function PatientSelector({
  groups,
  active,
}: {
  groups: HouseholdGroup[]
  active: ActivePatient | null
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const patients = groups.flatMap((group) => group.patients)

  if (patients.length === 0) {
    return (
      <div className="flex h-11 items-center gap-2 rounded-xl border border-dashed border-border px-3 text-xs text-muted-foreground">
        <UserRound aria-hidden="true" className="size-3.5" />
        No patients yet
      </div>
    )
  }

  if (patients.length === 1 && active) {
    return (
      <div className="flex h-11 min-w-0 items-center gap-2 rounded-xl border border-border bg-card px-3">
        <UserRound aria-hidden="true" className="size-4 shrink-0 text-sage" />
        <span className="truncate text-sm font-medium">{active.name}</span>
        <span className="hidden max-w-36 truncate text-xs text-muted-foreground sm:inline">
          {active.householdName}
        </span>
      </div>
    )
  }

  return (
    <Select
      value={active?.id ?? undefined}
      disabled={isPending}
      onValueChange={(value) => {
        startTransition(async () => {
          const result = await setActivePatientAction(value)
          if (result.ok) router.refresh()
        })
      }}
    >
      <SelectTrigger
        className="min-w-0 border-border bg-card sm:w-[260px]"
        aria-label="Active patient"
      >
        <span className="flex min-w-0 items-center gap-2">
          <UserRound aria-hidden="true" className="size-4 shrink-0 text-sage" />
          <SelectValue placeholder="Choose a patient" />
        </span>
      </SelectTrigger>
      <SelectContent>
        {groups
          .filter((group) => group.patients.length > 0)
          .map((group) => (
            <SelectGroup key={group.householdId}>
              <SelectLabel>{group.householdName}</SelectLabel>
              {group.patients.map((patient) => (
                <SelectItem key={patient.id} value={patient.id}>
                  {patient.name}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
      </SelectContent>
    </Select>
  )
}
