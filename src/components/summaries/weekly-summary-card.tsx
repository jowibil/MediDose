"use client"

import { useState, useTransition } from "react"
import { Check, FileClock, RefreshCcw, Sparkles } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  generateWeeklySummaryAction,
  markSummaryReviewedAction,
} from "@/lib/actions/summaries"
import { adherenceLabel } from "@/lib/summary"
import type { WeeklySummaryRow } from "@/lib/data"
import { cn } from "@/lib/utils"
import { formatDateLabel } from "@/lib/dates"

type Language = "en" | "fil"

export function WeeklySummaryCard({
  patientId,
  patientName,
  weekStart,
  weekEnd,
  timeZone,
  summary,
}: {
  patientId: string
  patientName: string
  weekStart: string
  weekEnd: string
  timeZone: string
  summary: WeeklySummaryRow | null
}) {
  const [language, setLanguage] = useState<Language>("en")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const prose = summary
    ? language === "en"
      ? summary.summaryEn
      : summary.summaryFil
    : null

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (!result.ok) setError(result.error ?? "Something went wrong.")
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="gap-2">
              <span className="flex items-center gap-2">
                <FileClock aria-hidden="true" className="size-4 text-sage-ink" />
                {formatDateLabel(weekStart)} – {formatDateLabel(weekEnd)}
              </span>
            </CardTitle>
            <CardDescription>
              {summary?.planTracked === false
                ? "No week plan was tracked, so these are logged doses only."
                : `${patientName} · doses that were scheduled in this week`}
            </CardDescription>
          </div>
          {summary?.summaryEn ? (
            summary.isReviewed ? (
              <Badge variant="safe">
                <Check aria-hidden="true" className="size-3.5" />
                Human-reviewed
              </Badge>
            ) : (
              <Badge variant="expiring">Draft · not reviewed</Badge>
            )
          ) : (
            <Badge variant="outline">Not written yet</Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {summary ? (
          <>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Stat label="Scheduled" value={summary.expectedCount} />
              <Stat label="Taken" value={summary.takenCount} />
              <Stat label="Skipped" value={summary.skippedCount} />
              <Stat
                label="Off-plan logs"
                value={summary.unscheduledCount}
              />
            </dl>

            <p className="text-sm font-medium">
              {adherenceLabel(summary.adherenceRate)}
              {summary.expectedCount === 0
                ? " — nothing was scheduled, so there is no rate to report."
                : "."}
            </p>

            {summary.removedMidweek.length > 0 ? (
              <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                {summary.removedMidweek.map((entry, index) => (
                  <li key={`${entry.medicine_name}-${index}`}>
                    {entry.medicine_name ?? "A medicine"} was archived mid-week:
                    {" "}
                    {entry.count ?? 0} future dose
                    {entry.count === 1 ? "" : "s"} removed from this week.
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {summary.lowStock.map((item) => (
                <Badge key={`low-${item.name}`} variant="outline">
                  Low stock · {item.name} ({item.stock})
                </Badge>
              ))}
              {summary.expiring.map((item) => (
                <Badge key={`exp-${item.name}`} variant="expiring">
                  Expires in {item.daysLeft} d · {item.name}
                </Badge>
              ))}
            </div>

            {summary.summaryEn ? (
            <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
              <div className="mb-2 flex items-center gap-1">
                {(["en", "fil"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setLanguage(option)}
                    aria-pressed={language === option}
                    className={cn(
                      "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                      language === option
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {option === "en" ? "English" : "Filipino"}
                  </button>
                ))}
              </div>
              <p className="text-sm leading-relaxed whitespace-pre-line">
                {prose ?? "This language was not generated. Regenerate to add it."}
              </p>
            </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                The week is frozen and its numbers are final. Write the summary
                when you are ready to review the prose.
              </p>
            )}

            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Written by AI from this week’s record, then reviewed by a person.
              It is not medical advice. Regenerating replaces this text and
              clears the review.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            The week is frozen, so its numbers will not change. Write the summary
            when you are ready to review it.
          </p>
        )}

        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={summary ? "outline" : "default"}
            disabled={isPending}
            onClick={() =>
              run(() =>
                generateWeeklySummaryAction({ patientId, weekStart, timeZone }),
              )
            }
          >
            {summary ? (
              <RefreshCcw aria-hidden="true" className="size-4" />
            ) : (
              <Sparkles aria-hidden="true" className="size-4" />
            )}
            {isPending
              ? "Writing…"
              : summary
                ? "Regenerate"
                : "Write summary"}
          </Button>

          {summary ? (
            <Button
              type="button"
              size="sm"
              variant={summary.isReviewed ? "ghost" : "outline"}
              disabled={isPending}
              onClick={() =>
                run(() =>
                  markSummaryReviewedAction(summary.id, !summary.isReviewed),
                )
              }
            >
              <Check aria-hidden="true" className="size-4" />
              {summary.isReviewed ? "Clear review" : "Mark reviewed"}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="font-display text-2xl tabular-nums">{value}</dd>
    </div>
  )
}
