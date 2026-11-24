import Link from "next/link"
import { redirect } from "next/navigation"
import { Check, Clock3, History as HistoryIcon, XCircle } from "lucide-react"

import { getSessionContext, resolveActivePatient } from "@/lib/auth"
import { getTimeZone } from "@/lib/timezone"
import {
  getDoseLogs,
  getDisplayNames,
  getMedicinesIncludingArchived,
} from "@/lib/data"
import {
  addISODays,
  daysUntil,
  formatDateLabel,
  getTodayInTimeZone,
  isValidISODate,
} from "@/lib/dates"
import { occurrencesForRange, formatTime12h } from "@/lib/schedule"
import { mergeOccurrences, sortOccurrencesDesc } from "@/lib/occurrences"
import { formatDosage } from "@/lib/mappers"
import {
  SKIP_REASON_OPTIONS,
  skipReasonLabel,
  type DoseStatus,
  type SkipReason,
} from "@/types/medicine"
import { isSkipReason } from "@/lib/validation"
import { PageHeader } from "@/components/page-header"
import { NoPatientState } from "@/components/no-patient-state"
import { EmptySection } from "@/components/empty-section"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import { DoseControls } from "@/components/doses/dose-controls"

export const metadata = { title: "History" }

const PAGE_SIZE = 50

function formatLoggedAt(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone,
    }).format(new Date(iso))
  } catch {
    return formatDateLabel(iso.slice(0, 10))
  }
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string
    to?: string
    status?: string
    reason?: string
    medicine?: string
    page?: string
  }>
}) {
  const params = await searchParams
  const context = await getSessionContext()
  if (!context) redirect("/login")

  const active = await resolveActivePatient(context)
  if (!active) return <NoPatientState context={context} />

  const timeZone = await getTimeZone()
  const todayIso = getTodayInTimeZone(timeZone)

  let toIso = params.to && isValidISODate(params.to) ? params.to : todayIso
  let fromIso =
    params.from && isValidISODate(params.from)
      ? params.from
      : addISODays(toIso, -29)
  if (fromIso > toIso) [fromIso, toIso] = [toIso, fromIso]
  if (daysUntil(toIso, fromIso) > 89) {
    fromIso = addISODays(toIso, -89)
  }

  const statusFilter: DoseStatus | "all" =
    params.status === "taken" ||
    params.status === "skipped" ||
    params.status === "pending"
      ? params.status
      : "all"
  const reasonFilter: SkipReason | "all" =
    params.reason && isSkipReason(params.reason) ? params.reason : "all"

  const medicines = await getMedicinesIncludingArchived(active.id)
  const medicineFilter =
    params.medicine && medicines.some((medicine) => medicine.id === params.medicine)
      ? params.medicine
      : "all"

  const scopedMedicines =
    medicineFilter === "all"
      ? medicines
      : medicines.filter((medicine) => medicine.id === medicineFilter)

  const logs = await getDoseLogs(
    scopedMedicines.map((medicine) => medicine.id),
    fromIso,
    toIso,
  )
  const names = await getDisplayNames(
    logs.flatMap((log) => [log.logged_by, log.last_modified_by]),
  )

  const occurrences = mergeOccurrences(
    scopedMedicines.flatMap((medicine) =>
      occurrencesForRange(medicine, fromIso, toIso),
    ),
    logs,
    names,
  )

  const counts = {
    taken: occurrences.filter((occurrence) => occurrence.status === "taken")
      .length,
    skipped: occurrences.filter((occurrence) => occurrence.status === "skipped")
      .length,
    pending: occurrences.filter((occurrence) => occurrence.status === "pending")
      .length,
  }

  const reasonCounts = SKIP_REASON_OPTIONS.map((option) => ({
    ...option,
    count: occurrences.filter(
      (occurrence) =>
        occurrence.status === "skipped" && occurrence.skipReason === option.value,
    ).length,
  }))

  const filtered = occurrences.filter((occurrence) => {
    if (statusFilter !== "all" && occurrence.status !== statusFilter) return false
    if (reasonFilter !== "all" && occurrence.skipReason !== reasonFilter) {
      return false
    }
    return true
  })

  const sorted = sortOccurrencesDesc(filtered)
  const page = Math.max(1, Number(params.page) || 1)
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pageItems = sorted.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  )

  const medicineById = new Map(
    medicines.map((medicine) => [medicine.id, medicine]),
  )
  const clustersByDate = new Map<string, typeof pageItems>()
  for (const occurrence of pageItems) {
    const list = clustersByDate.get(occurrence.scheduledDate)
    if (list) list.push(occurrence)
    else clustersByDate.set(occurrence.scheduledDate, [occurrence])
  }

  function reasonHref(reason: SkipReason): string {
    const search = new URLSearchParams()
    search.set("from", fromIso)
    search.set("to", toIso)
    search.set("reason", reason)
    if (medicineFilter !== "all") search.set("medicine", medicineFilter)
    return `/history?${search.toString()}`
  }

  function pageHref(target: number): string {
    const search = new URLSearchParams()
    search.set("from", fromIso)
    search.set("to", toIso)
    if (statusFilter !== "all") search.set("status", statusFilter)
    if (reasonFilter !== "all") search.set("reason", reasonFilter)
    if (medicineFilter !== "all") search.set("medicine", medicineFilter)
    if (target > 1) search.set("page", String(target))
    return `/history?${search.toString()}`
  }

  const isFiltered =
    statusFilter !== "all" || reasonFilter !== "all" || medicineFilter !== "all"

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="History"
        description={`${active.name} · ${formatDateLabel(fromIso)} – ${formatDateLabel(toIso)}`}
      />

      <section aria-labelledby="history-filters" className="panel p-4">
        <h2 id="history-filters" className="sr-only">
          Filter dose history
        </h2>
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label htmlFor="filter-from" className="mb-1.5 text-xs">
              From
            </Label>
            <Input
              id="filter-from"
              type="date"
              name="from"
              defaultValue={fromIso}
            />
          </div>
          <div>
            <Label htmlFor="filter-to" className="mb-1.5 text-xs">
              To
            </Label>
            <Input id="filter-to" type="date" name="to" defaultValue={toIso} />
          </div>
          <div>
            <Label htmlFor="filter-status" className="mb-1.5 text-xs">
              Status
            </Label>
            <NativeSelect
              id="filter-status"
              name="status"
              defaultValue={statusFilter}
            >
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="taken">Taken</option>
              <option value="skipped">Skipped</option>
            </NativeSelect>
          </div>
          <div>
            <Label htmlFor="filter-reason" className="mb-1.5 text-xs">
              Skip reason
            </Label>
            <NativeSelect
              id="filter-reason"
              name="reason"
              defaultValue={reasonFilter}
            >
              <option value="all">All reasons</option>
              {SKIP_REASON_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <Label htmlFor="filter-medicine" className="mb-1.5 text-xs">
              Medicine
            </Label>
            <NativeSelect
              id="filter-medicine"
              name="medicine"
              defaultValue={medicineFilter}
            >
              <option value="all">All medicines</option>
              {medicines.map((medicine) => (
                <option key={medicine.id} value={medicine.id}>
                  {medicine.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex items-end gap-2">
            <Button type="submit" className="flex-1">
              Apply
            </Button>
            <Button type="button" variant="outline" asChild>
              <Link href="/history">Reset</Link>
            </Button>
          </div>
        </form>
      </section>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
        <span className="flex items-center gap-1.5">
          <Check aria-hidden="true" className="size-3.5 text-sage-ink" />
          <span className="font-medium tabular-nums">{counts.taken}</span>
          <span className="text-muted-foreground">taken</span>
        </span>
        <span className="flex items-center gap-1.5">
          <XCircle aria-hidden="true" className="size-3.5 text-amber-ink" />
          <span className="font-medium tabular-nums">{counts.skipped}</span>
          <span className="text-muted-foreground">skipped</span>
        </span>
        <span className="flex items-center gap-1.5">
          <Clock3 aria-hidden="true" className="size-3.5 text-muted-foreground" />
          <span className="font-medium tabular-nums">{counts.pending}</span>
          <span className="text-muted-foreground">pending</span>
        </span>
        {reasonCounts.filter((reason) => reason.count > 0).length === 0 ? (
          <span className="text-muted-foreground">
            No skipped doses in this range
          </span>
        ) : (
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-muted-foreground">Skip reasons:</span>
            {reasonCounts
              .filter((reason) => reason.count > 0)
              .map((reason) => (
                <Link
                  key={reason.value}
                  href={reasonHref(reason.value)}
                  className="rounded-md px-1.5 py-0.5 underline decoration-border underline-offset-4 hover:bg-muted hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {reason.label}{" "}
                  <span className="tabular-nums">{reason.count}</span>
                </Link>
              ))}
          </span>
        )}
      </div>

      {pageItems.length === 0 ? (
        <EmptySection
          icon={HistoryIcon}
          title="No doses in this range"
          description={
            isFiltered
              ? "Nothing matches these filters. Try a wider date range or clear the status and reason."
              : "Try widening the dates. Pending doses appear once a medicine’s schedule starts."
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          {Array.from(clustersByDate.entries()).map(([dateIso, items]) => (
            <section key={dateIso} className="flex flex-col gap-2">
              <h2 className="font-display text-sm font-medium text-muted-foreground">
                {formatDateLabel(dateIso, {
                  weekday: "long",
                  month: "short",
                  day: "numeric",
                })}
              </h2>
              <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/80 bg-card shadow-card">
                {items.map((occurrence) => {
                  const medicine = medicineById.get(occurrence.medicineId)
                  if (!medicine) return null
                  return (
                    <li
                      key={`${occurrence.medicineId}-${occurrence.scheduledTime}`}
                      className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p className="text-sm font-medium">{medicine.name}</p>
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {formatTime12h(occurrence.scheduledTime)} ·{" "}
                            {formatDosage(
                              medicine.dosageAmount,
                              medicine.dosageUnit,
                            )}
                          </span>
                        </div>
                        {occurrence.status === "skipped" ? (
                          <p className="mt-1 text-xs text-amber-ink">
                            {skipReasonLabel(occurrence.skipReason)}
                            {occurrence.skipNote ? ` — ${occurrence.skipNote}` : ""}
                          </p>
                        ) : null}
                        {occurrence.loggedAt ? (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            Logged
                            {occurrence.loggedByName
                              ? ` by ${occurrence.loggedByName}`
                              : ""}{" "}
                            {formatLoggedAt(occurrence.loggedAt, timeZone)}
                            {occurrence.lastModifiedByName
                              ? ` · last changed by ${occurrence.lastModifiedByName}`
                              : ""}
                          </p>
                        ) : null}
                      </div>

                      <DoseControls
                        occurrence={occurrence}
                        stock={medicine.stock}
                        timeZone={timeZone}
                      />
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {sorted.length > PAGE_SIZE ? (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-xs tabular-nums text-muted-foreground">
            Page {currentPage} of {pageCount}
          </span>
          <div className="flex gap-2">
            {currentPage > 1 ? (
              <Button size="sm" variant="outline" asChild>
                <Link href={pageHref(currentPage - 1)}>Previous</Link>
              </Button>
            ) : null}
            {currentPage < pageCount ? (
              <Button size="sm" variant="outline" asChild>
                <Link href={pageHref(currentPage + 1)}>Next</Link>
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
