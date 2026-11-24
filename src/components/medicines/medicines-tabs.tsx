import Link from "next/link"

import { cn } from "@/lib/utils"

const TABS = [
  { value: "cabinet", label: "Cabinet" },
  { value: "inventory", label: "Inventory" },
  { value: "expiration", label: "Expiration" },
] as const

export type MedicinesTab = (typeof TABS)[number]["value"]

export function isMedicinesTab(value: string | undefined): value is MedicinesTab {
  return TABS.some((tab) => tab.value === value)
}

export function MedicinesTabs({ active }: { active: MedicinesTab }) {
  return (
    <nav
      aria-label="Medicine sections"
      className="mb-5 flex h-11 w-full items-center gap-1 overflow-x-auto border-b border-border/80 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:h-10 md:w-fit"
    >
      {TABS.map((tab) => {
        const isActive = tab.value === active
        return (
          <Link
            key={tab.value}
            href={`/medicines?tab=${tab.value}`}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "relative inline-flex h-11 shrink-0 items-center justify-center rounded-lg px-3 text-sm font-medium tracking-tight text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:h-9",
              isActive &&
                "text-foreground after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-amber",
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
