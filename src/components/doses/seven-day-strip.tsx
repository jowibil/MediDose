import { Check } from "lucide-react"

import { cn } from "@/lib/utils"

export interface TimelineDay {
  iso: string
  weekday: string
  dateNumber: number
  total: number
  taken: number
  isToday: boolean
}

export function SevenDayStrip({ days }: { days: TimelineDay[] }) {
  return (
    <section aria-labelledby="week-heading" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2
          id="week-heading"
          className="font-display text-base font-medium tracking-tight"
        >
          The week ahead
        </h2>
        <p className="text-xs text-muted-foreground">Scheduled intakes</p>
      </div>

      <ol className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {days.map((day) => {
          const complete = day.total > 0 && day.taken === day.total
          const progress =
            day.total === 0 ? 0 : Math.round((day.taken / day.total) * 100)
          return (
            <li key={day.iso}>
              <div
                className={cn(
                  "flex h-full flex-col items-center gap-1.5 rounded-xl border px-1 py-2.5 text-center",
                  day.isToday
                    ? "border-foreground/25 bg-card shadow-card"
                    : "border-border/70 bg-surface/50",
                )}
              >
                <span className="text-[11px] font-medium text-muted-foreground">
                  {day.weekday}
                </span>
                <span className="font-display text-base leading-none tabular-nums">
                  {day.dateNumber}
                </span>
                <span className="flex h-4 items-center justify-center">
                  {day.total === 0 ? (
                    <span className="text-[10px] text-muted-foreground/80">
                      <span aria-hidden="true">—</span>
                      <span className="sr-only">No doses</span>
                    </span>
                  ) : complete ? (
                    <Check
                      aria-label="All doses taken"
                      className="size-3.5 text-sage-ink"
                    />
                  ) : (
                    <span
                      className="text-[10px] tabular-nums text-muted-foreground"
                      aria-label={`${day.taken} of ${day.total} doses taken`}
                    >
                      {day.taken}/{day.total}
                    </span>
                  )}
                </span>
                <span
                  aria-hidden="true"
                  className="h-0.5 w-5 overflow-hidden rounded-full bg-muted"
                >
                  <span
                    className="block h-full rounded-full bg-sage"
                    style={{ width: `${progress}%` }}
                  />
                </span>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
