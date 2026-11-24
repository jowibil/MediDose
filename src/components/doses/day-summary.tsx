import { Check, Clock3, XCircle } from "lucide-react"

export function DaySummary({
  taken,
  skipped,
  pending,
}: {
  taken: number
  skipped: number
  pending: number
}) {
  const total = taken + skipped + pending
  const percent = total === 0 ? 0 : Math.round((taken / total) * 100)

  return (
    <section
      aria-labelledby="day-progress"
      className="rounded-2xl border border-border/80 bg-card p-5 shadow-card"
    >
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div>
          <h2
            id="day-progress"
            className="text-sm font-medium text-muted-foreground"
          >
            Today’s progress
          </h2>
          <p className="mt-1.5 flex items-baseline gap-2">
            <span className="font-display text-4xl leading-none font-medium tabular-nums">
              {taken}
            </span>
            <span className="text-sm text-muted-foreground">
              of {total} dose{total === 1 ? "" : "s"} taken
            </span>
          </p>
        </div>

        <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          <li className="flex items-center gap-1.5">
            <Check aria-hidden="true" className="size-3.5 text-sage-ink" />
            <span className="tabular-nums font-medium">{taken}</span>
            <span className="text-muted-foreground">taken</span>
          </li>
          <li className="flex items-center gap-1.5">
            <XCircle aria-hidden="true" className="size-3.5 text-amber-ink" />
            <span className="tabular-nums font-medium">{skipped}</span>
            <span className="text-muted-foreground">skipped</span>
          </li>
          <li className="flex items-center gap-1.5">
            <Clock3 aria-hidden="true" className="size-3.5 text-muted-foreground" />
            <span className="tabular-nums font-medium">{pending}</span>
            <span className="text-muted-foreground">still due</span>
          </li>
        </ul>
      </div>

      <div
        role="progressbar"
        aria-label={`${taken} of ${total} doses taken today`}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={taken}
        className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-sage transition-[width] duration-300 motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      </div>
    </section>
  )
}
