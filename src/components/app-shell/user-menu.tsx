"use client"

import { ChevronDown, LogOut, UserRound } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { RoleBadge } from "@/components/app-shell/role-badge"
import { signOutAction } from "@/lib/actions/auth"
import type { HouseholdRole } from "@/types/medicine"

const ROLE_COPY: Record<HouseholdRole, string> = {
  owner: "You manage this household — patients, medicines, and caregiver access.",
  caregiver: "You can log doses and restock. An owner manages medicines and settings.",
  patient:
    "You see your own medicines and dose history. Ask a caregiver to correct a dose.",
}

export function UserMenu({
  displayName,
  email,
  role,
}: {
  displayName: string
  email: string
  role: HouseholdRole
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-11 max-w-[180px] gap-2 border-border bg-card px-2.5 md:h-9"
          aria-label={`Account menu for ${displayName}`}
        >
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted">
            <UserRound aria-hidden="true" className="size-3.5 text-muted-foreground" />
          </span>
          <span className="truncate">{displayName}</span>
          <ChevronDown aria-hidden="true" className="size-3.5 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 rounded-xl p-3">
        <PopoverHeader>
          <PopoverTitle className="truncate">{displayName}</PopoverTitle>
          <PopoverDescription className="truncate text-xs">
            {email}
          </PopoverDescription>
        </PopoverHeader>
        <div className="pt-1">
          <RoleBadge role={role} />
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {ROLE_COPY[role]}
        </p>
        <form action={signOutAction} className="pt-1">
          <Button
            type="submit"
            variant="outline"
            className="w-full justify-start"
            size="sm"
          >
            <LogOut aria-hidden="true" className="size-4" />
            Sign out
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}
