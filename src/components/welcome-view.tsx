import Link from "next/link"
import { CalendarClock, PackageCheck, Plus, TriangleAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { ActivePatient } from "@/lib/auth"

const FACTS = [
  {
    icon: CalendarClock,
    text: "Schedules spread across waking hours, in strict intervals, or at times you choose.",
  },
  {
    icon: PackageCheck,
    text: "Stock counts and days of supply update as doses are logged and restocked.",
  },
  {
    icon: TriangleAlert,
    text: "Expiring medicines are flagged 30 days ahead so nothing is used past its date.",
  },
]

export function WelcomeView({
  active,
  role,
}: {
  active: ActivePatient
  role: "owner" | "caregiver"
}) {
  return (
    <section
      aria-labelledby="welcome-heading"
      className="rounded-2xl border border-border/80 bg-card p-6 shadow-card sm:p-8"
    >
      <p className="text-xs font-medium text-sage-ink">
        First medicine for {active.name}
      </p>
      <h2
        id="welcome-heading"
        className="mt-2 max-w-xl font-display text-2xl leading-tight font-medium sm:text-3xl"
      >
        Nothing is scheduled yet — start with one prescription.
      </h2>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
        Add the medicine, its dosage, and how often it’s taken. MediDose builds
        the daily slots, tracks the supply left, and keeps a shared history for{" "}
        {active.householdName}.
      </p>

      <div className="mt-6">
        {role === "owner" ? (
          <Button size="lg" asChild>
            <Link href="/medicines/new">
              <Plus aria-hidden="true" className="size-4" /> Add your first medicine
            </Link>
          </Button>
        ) : (
          <p className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            No medicines yet. Your household owner can add them; you’ll be able to
            log doses and restock as soon as they do.
          </p>
        )}
      </div>

      <ul className="mt-8 grid gap-4 border-t border-border/60 pt-6 sm:grid-cols-3">
        {FACTS.map((fact) => (
          <li key={fact.text} className="flex gap-2.5">
            <fact.icon
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-sage"
            />
            <span className="text-xs leading-relaxed text-muted-foreground">
              {fact.text}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
