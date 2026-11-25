"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  CalendarClock,
  ClipboardList,
  FileClock,
  History,
  Settings,
} from "lucide-react"

import { cn } from "@/lib/utils"
import type { HouseholdRole } from "@/types/medicine"

const TODAY = { href: "/dashboard", label: "Today", icon: CalendarClock }
const MEDICINES = { href: "/medicines", label: "Medicines", icon: ClipboardList }
const HISTORY = { href: "/history", label: "History", icon: History }
const SUMMARIES = { href: "/summaries", label: "Summaries", icon: FileClock }
const SETTINGS = { href: "/settings", label: "Settings", icon: Settings }

/** A patient has no cabinet to manage and no settings to change. */
const LINKS_BY_ROLE = {
  owner: [TODAY, MEDICINES, HISTORY, SUMMARIES, SETTINGS],
  caregiver: [TODAY, MEDICINES, HISTORY, SUMMARIES],
  patient: [TODAY, HISTORY],
} as const

export function NavLinks({ role }: { role: HouseholdRole }) {
  const pathname = usePathname()
  const links = LINKS_BY_ROLE[role]

  return (
    <nav
      aria-label="Main"
      className="flex min-w-0 items-center gap-1 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {links.map((link) => {
        const active =
          pathname === link.href || pathname.startsWith(`${link.href}/`)
        const Icon = link.icon
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-medium transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              active
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon aria-hidden="true" className="size-4" />
            {link.label}
          </Link>
        )
      })}
    </nav>
  )
}
