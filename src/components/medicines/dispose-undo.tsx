"use client"

import { useCallback, useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import {
  DisposeUndoContext,
  type DisposedNotice,
} from "@/components/medicines/dispose-undo-context"
import { undoDisposeMedicineAction } from "@/lib/actions/medicines"

/** How long the banner offers Undo. The server allows 5 minutes (see the RPC). */
const UNDO_WINDOW_SECONDS = 30

function pluralDoses(count: number): string {
  return `${count} dose${count === 1 ? "" : "s"}`
}

/**
 * Holds the disposal banner above the tab panels.
 *
 * It lives here rather than inside the medicine row because a successful
 * disposal archives the medicine: the row unmounts on the next refresh, and a
 * banner owned by the row would disappear with the thing it was offering to
 * undo.
 */
export function DisposeUndoProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [notice, setNotice] = useState<DisposedNotice | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(UNDO_WINDOW_SECONDS)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Derived rather than a second piece of state: one clock, no cascading render.
  const expired = notice !== null && secondsLeft <= 0

  const announce = useCallback((next: DisposedNotice) => {
    setNotice(next)
    setSecondsLeft(UNDO_WINDOW_SECONDS)
    setError(null)
  }, [])

  useEffect(() => {
    if (!notice || secondsLeft <= 0) return
    const timer = window.setTimeout(() => setSecondsLeft((value) => value - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [notice, secondsLeft])

  function undo() {
    if (!notice) return
    setError(null)
    startTransition(async () => {
      const result = await undoDisposeMedicineAction(notice.medicineId)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setNotice(null)
      router.refresh()
    })
  }

  return (
    <DisposeUndoContext.Provider value={{ announce }}>
      {notice ? (
        <div
          data-print="hide"
          role="status"
          aria-live="polite"
          className="mb-4 flex flex-col gap-2 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm sm:flex-row sm:items-start sm:justify-between"
        >
          <div className="min-w-0">
            <p>
              Disposed{" "}
              <span className="font-medium text-foreground">
                {notice.medicineName}
              </span>{" "}
              — {pluralDoses(notice.discarded)} discarded.
              {expired ? null : (
                <span className="text-muted-foreground">
                  {" "}
                  Undo available for {secondsLeft}s.
                </span>
              )}
            </p>
            {expired ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Settings → Restore brings the record back, but not the stock.
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="mt-0.5 text-xs text-destructive">
                {error}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 gap-1">
            {expired ? null : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={undo}
                disabled={isPending}
              >
                {isPending ? "Undoing…" : "Undo"}
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setNotice(null)}
            >
              Dismiss
            </Button>
          </div>
        </div>
      ) : null}
      {children}
    </DisposeUndoContext.Provider>
  )
}
