import Link from "next/link"
import { redirect } from "next/navigation"
import { CalendarClock, Check, Clock3, PackageX, TriangleAlert } from "lucide-react"

import { getSessionContext, resolveActivePatient } from "@/lib/auth"
import { getTimeZone } from "@/lib/timezone"
import { currentWeekStart } from "@/lib/summary"
import { ensureWeekFrozen } from "@/lib/actions/summaries"
import { getDoseLogs, getDisplayNames, getMedicines } from "@/lib/data"
import {
  addISODays,
  daysUntil,
  formatDateLabel,
  formatLongDate,
  getTodayInTimeZone,
  parseISODate,
} from "@/lib/dates"
import { formatTime12h, occurrencesForRange } from "@/lib/schedule"
import { groupByTime, mergeOccurrences } from "@/lib/occurrences"
import { formatDosage } from "@/lib/mappers"
import { calculateSupply } from "@/lib/supply"
import { cn } from "@/lib/utils"
import { PageHeader } from "@/components/page-header"
import { NoPatientState } from "@/components/no-patient-state"
import { WelcomeView } from "@/components/welcome-view"
import { SevenDayStrip } from "@/components/doses/seven-day-strip"
import { DaySummary } from "@/components/doses/day-summary"
import { DoseControls } from "@/components/doses/dose-controls"
import { EmptySection } from "@/components/empty-section"
import { SupplyBadge } from "@/components/medicine-badges"
import { RoleBadge } from "@/components/app-shell/role-badge"

export const metadata = { title: "Dashboard" }

export default async function DashboardPage() {
  const context = await getSessionContext()
  if (!context) redirect("/login")

  const active = await resolveActivePatient(context)
  if (!active) return <NoPatientState context={context} />

  const timeZone = await getTimeZone()
  const todayIso = getTodayInTimeZone(timeZone)
  const endIso = addISODays(todayIso, 6)

  // Freeze the current week on first visit, for every role. Idempotent, and it
  // never blocks the page: a failure leaves the week unfrozen, not broken.
  await ensureWeekFrozen(active.id, currentWeekStart(todayIso), timeZone)
  const medicines = await getMedicines(active.id)

  if (medicines.length === 0) {
    return (
      <>
        <PageHeader
          title="Today"
          description={`${formatLongDate(todayIso)} · ${active.name} · ${active.householdName}`}
        />
        <WelcomeView active={active} role={context.role} />
      </>
    )
  }

  const logs = await getDoseLogs(
    medicines.map((medicine) => medicine.id),
    todayIso,
    endIso,
  )
  const names = await getDisplayNames(
    logs.flatMap((log) => [log.logged_by, log.last_modified_by]),
  )

  const rangeOccurrences = medicines.flatMap((medicine) =>
    occurrencesForRange(medicine, todayIso, endIso),
  )
  const merged = mergeOccurrences(rangeOccurrences, logs, names)

  const todayOccurrences = merged.filter(
    (occurrence) => occurrence.scheduledDate === todayIso,
  )
  const clusters = groupByTime(todayOccurrences)

  const now = parseISODate(todayIso)
  const medicineById = new Map(medicines.map((medicine) => [medicine.id, medicine]))

  const counts = {
    taken: todayOccurrences.filter((occurrence) => occurrence.status === "taken")
      .length,
    skipped: todayOccurrences.filter(
      (occurrence) => occurrence.status === "skipped",
    ).length,
    pending: todayOccurrences.filter(
      (occurrence) => occurrence.status === "pending",
    ).length,
  }

  const supplyAlerts = medicines.filter((medicine) => {
    const level = calculateSupply(
      medicine.stock,
      medicine.frequencyPerDay,
      now,
    ).level
    return level === "out" || level === "critical"
  })

  const expirationAlerts = medicines.filter(
    (medicine) => daysUntil(medicine.expirationDate, todayIso) <= 30,
  )

  const days = Array.from({ length: 7 }, (_, offset) => {
    const iso = addISODays(todayIso, offset)
    const dayOccurrences = merged.filter(
      (occurrence) => occurrence.scheduledDate === iso,
    )
    return {
      iso,
      weekday: formatDateLabel(iso, { weekday: "short" }),
      dateNumber: parseISODate(iso).getDate(),
      total: dayOccurrences.length,
      taken: dayOccurrences.filter((occurrence) => occurrence.status === "taken")
        .length,
      isToday: offset === 0,
    }
  })

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        title="Today"
        description={`${formatLongDate(todayIso)} · ${active.name}`}
        meta={
          <>
            <RoleBadge role={context.role} />
            <span className="text-xs text-muted-foreground">
              {active.householdName}
            </span>
          </>
        }
      />

      <DaySummary
        taken={counts.taken}
        skipped={counts.skipped}
        pending={counts.pending}
      />

      <SevenDayStrip days={days} />

      {supplyAlerts.length > 0 || expirationAlerts.length > 0 ? (
        <div className="flex flex-col gap-2">
          {supplyAlerts.length > 0 ? (
            <div className="flex flex-col gap-1.5 rounded-xl border border-brick/25 bg-brick-soft/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-start gap-2 text-sm">
                <PackageX
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-brick-ink"
                />
                <span>
                  <span className="font-medium text-brick-ink">
                    Supply running out.
                  </span>{" "}
                  <span className="text-foreground/80">
                    {supplyAlerts.map((medicine) => medicine.name).join(", ")}
                  </span>
                </span>
              </p>
              {context.role === "patient" ? null : (
                <Link
                  href="/medicines?tab=inventory"
                  className="shrink-0 self-start rounded text-xs font-medium text-brick-ink underline decoration-brick/40 underline-offset-4 hover:decoration-brick-ink focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:self-auto"
                >
                  Open inventory
                </Link>
              )}
            </div>
          ) : null}

          {expirationAlerts.length > 0 ? (
            <div className="flex flex-col gap-1.5 rounded-xl border border-amber/30 bg-amber-soft/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-start gap-2 text-sm">
                <TriangleAlert
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-amber-ink"
                />
                <span>
                  <span className="font-medium text-amber-ink">
                    Expiration check.
                  </span>{" "}
                  <span className="text-foreground/80">
                    {expirationAlerts.length} medicine
                    {expirationAlerts.length === 1 ? "" : "s"} expiring within 30
                    days or already expired.
                  </span>
                </span>
              </p>
              {context.role === "patient" ? null : (
                <Link
                  href="/medicines?tab=expiration"
                  className="shrink-0 self-start rounded text-xs font-medium text-amber-ink underline decoration-amber/40 underline-offset-4 hover:decoration-amber-ink focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:self-auto"
                >
                  Review expiration board
                </Link>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {clusters.length === 0 ? (
        <EmptySection
          icon={CalendarClock}
          title="No doses scheduled for today"
          description="Today is clear. Check the week ahead or add another medicine to the cabinet."
        />
      ) : (
        <section aria-labelledby="dose-schedule" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2
              id="dose-schedule"
              className="font-display text-xl font-medium tracking-tight"
            >
              Dose schedule
            </h2>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock3 aria-hidden="true" className="size-3.5" />
              {counts.pending === 0
                ? "Every dose accounted for"
                : `${counts.pending} still due today`}
            </p>
          </div>

          <ol className="flex flex-col">
            {clusters.map(([time, occurrences]) => {
              const takenCount = occurrences.filter(
                (occurrence) => occurrence.status === "taken",
              ).length
              const allTaken = takenCount === occurrences.length
              const [clock, period] = formatTime12h(time).split(" ")

              return (
                <li
                  key={time}
                  className="grid grid-cols-[3.25rem_1fr] gap-3 sm:grid-cols-[4.25rem_1fr] sm:gap-5"
                >
                  <div className="pt-2.5 text-right">
                    <time
                      dateTime={time}
                      className="block font-display text-lg leading-none font-medium tabular-nums"
                    >
                      {clock}
                    </time>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      {period}
                    </span>
                  </div>

                  <div className="relative border-l border-border/80 pb-5 pl-3 sm:pl-5">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute top-3 -left-[5px] size-2.5 rounded-full border-2 border-background",
                        allTaken ? "bg-sage" : "bg-line-strong",
                      )}
                    />

                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">
                        <span className="tabular-nums">
                          {takenCount}/{occurrences.length}
                        </span>{" "}
                        taken
                      </p>
                      {allTaken ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-sage-ink">
                          <Check aria-hidden="true" className="size-3.5" />
                          Complete
                        </span>
                      ) : null}
                    </div>

                    <ul className="flex flex-col gap-2">
                      {occurrences.map((occurrence) => {
                        const medicine = medicineById.get(occurrence.medicineId)
                        if (!medicine) return null
                        return (
                          <li
                            key={`${occurrence.medicineId}-${occurrence.scheduledTime}`}
                            className={cn(
                              "flex flex-col gap-3 rounded-xl border bg-card px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4",
                              occurrence.status === "taken" &&
                                "border-sage/20 bg-sage-soft/20",
                              occurrence.status === "skipped" &&
                                "border-amber/25 bg-amber-soft/20",
                              occurrence.status === "pending" &&
                                "border-border/80",
                            )}
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                {medicine.name}
                              </p>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {formatDosage(
                                  medicine.dosageAmount,
                                  medicine.dosageUnit,
                                )}{" "}
                                · {medicine.frequencyPerDay}×/day
                              </p>
                              <div className="mt-1.5">
                                <SupplyBadge medicine={medicine} now={now} />
                              </div>
                            </div>
                            <DoseControls
                              occurrence={occurrence}
                              stock={medicine.stock}
                              timeZone={timeZone}
                              role={context.role}
                              // Staff see today's status here and act in History, so
                              // the same dose is never logged from two places.
                              readOnly={context.role !== "patient"}
                            />
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                </li>
              )
            })}
          </ol>
        </section>
      )}
    </div>
  )
}
