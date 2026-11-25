import { redirect } from "next/navigation"
import { Info } from "lucide-react"

import { getSessionContext, resolveActivePatient } from "@/lib/auth"
import { getTimeZone } from "@/lib/timezone"
import { addISODays, getTodayInTimeZone } from "@/lib/dates"
import { getWeeklySummaries } from "@/lib/data"
import { currentWeekStart } from "@/lib/summary"
import { ensureWeekFrozen } from "@/lib/actions/summaries"
import { PageHeader } from "@/components/page-header"
import { NoPatientState } from "@/components/no-patient-state"
import { RoleBadge } from "@/components/app-shell/role-badge"
import { WeeklySummaryCard } from "@/components/summaries/weekly-summary-card"

export const metadata = { title: "Weekly summaries" }

/** How many weeks the page offers, including the current one. */
const WEEKS_SHOWN = 8

export default async function SummariesPage() {
  const context = await getSessionContext()
  if (!context) redirect("/login")
  if (context.role === "patient") redirect("/dashboard")

  const active = await resolveActivePatient(context)
  if (!active) return <NoPatientState context={context} />

  const timeZone = await getTimeZone()
  const todayIso = getTodayInTimeZone(timeZone)
  const weekStart = currentWeekStart(todayIso)

  // The dashboard also does this; the page must work on a direct visit. It is
  // idempotent and skips the RPC when the week is already frozen.
  const weekFrozen = await ensureWeekFrozen(active.id, weekStart, timeZone)

  const summaries = await getWeeklySummaries(active.id, WEEKS_SHOWN)
  const byWeek = new Map(summaries.map((summary) => [summary.weekStart, summary]))

  const weeks = Array.from({ length: WEEKS_SHOWN }, (_, index) =>
    addISODays(weekStart, index * -7),
  )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Weekly summaries"
        description={`${active.name} · ${active.householdName}`}
        meta={<RoleBadge role={context.role} />}
      />

      <div className="flex items-start gap-2.5 rounded-2xl border border-border/80 bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <p>
          Each week is frozen the first time it is opened, so its numbers stay
          fixed even if a schedule changes later. Summaries are written from
          that record by AI and are marked as drafts until a person reviews
          them. This is a care log, not medical advice.
        </p>
      </div>

      {weekFrozen ? null : (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-2xl border border-destructive/40 bg-destructive/5 p-3 text-xs leading-relaxed text-destructive"
        >
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p>
            This week could not be frozen, so its numbers are not fixed yet and
            a summary written now would be missing them. Reload the page to try
            again; the failure is recorded in the server log.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {weeks.map((week) => (
          <WeeklySummaryCard
            key={week}
            patientId={active.id}
            patientName={active.name}
            weekStart={week}
            weekEnd={addISODays(week, 6)}
            timeZone={timeZone}
            summary={byWeek.get(week) ?? null}
          />
        ))}
      </div>
    </div>
  )
}
