"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Check, Clock3, RotateCcw, XCircle } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { SkipDialog } from "@/components/doses/skip-dialog"
import {
  logSkippedAction,
  logTakenAction,
  updateDoseStatusAction,
} from "@/lib/actions/doses"
import type { ActionResult } from "@/lib/action-result"
import {
  skipReasonLabel,
  type DoseOccurrence,
  type HouseholdRole,
  type SkipReason,
} from "@/types/medicine"

export function DoseControls({
  occurrence,
  stock,
  timeZone,
  role,
  readOnly = false,
}: {
  occurrence: DoseOccurrence
  stock: number
  timeZone: string
  role: HouseholdRole
  readOnly?: boolean
}) {
  // A patient may record a dose but never revise one: re-marking taken →
  // skipped returns stock, which is a caregiver's job. The persistent line
  // below replaces the undo control, and the database refuses the call anyway.
  const isPatient = role === "patient"
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState("")
  const [dialogMode, setDialogMode] = useState<"skip" | "undo" | null>(null)

  const pending = occurrence.status === "pending"
  const outOfStock = stock <= 0
  const skipReason = occurrence.skipReason

  function run(
    action: () => Promise<ActionResult>,
    successMessage: string,
    after?: () => void,
  ) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (!result.ok) {
        setError(result.error)
        return
      }
      setAnnouncement(successMessage)
      after?.()
      router.refresh()
    })
  }

  function handleTake() {
    run(
      () =>
        logTakenAction({
          medicineId: occurrence.medicineId,
          scheduledDate: occurrence.scheduledDate,
          scheduledTime: occurrence.scheduledTime,
          timeZone,
        }),
      "Dose marked taken.",
    )
  }

  function handleMarkTaken() {
    if (!occurrence.logId) return
    run(
      () =>
        updateDoseStatusAction({
          logId: occurrence.logId as string,
          status: "taken",
        }),
      "Dose marked taken.",
    )
  }

  function handleSkip(reason: SkipReason, note: string) {
    if (occurrence.logId) {
      run(
        () =>
          updateDoseStatusAction({
            logId: occurrence.logId as string,
            status: "skipped",
            reason,
            note,
          }),
        `Dose marked skipped — ${skipReasonLabel(reason)}.`,
        () => setDialogMode(null),
      )
      return
    }

    run(
      () =>
        logSkippedAction({
          medicineId: occurrence.medicineId,
          scheduledDate: occurrence.scheduledDate,
          scheduledTime: occurrence.scheduledTime,
          reason,
          note,
          timeZone,
        }),
      `Dose marked skipped — ${skipReasonLabel(reason)}.`,
      () => setDialogMode(null),
    )
  }

  // History is a record, not a place to act: the dashboard is where doses are
  // logged, so a patient sees the status only and staff keep the correction
  // controls.
  if (readOnly) {
    return (
      <div className="flex w-full sm:w-auto sm:justify-end">
        {pending ? (
          <Badge variant="outline">
            <Clock3 aria-hidden="true" className="size-3.5" />
            Pending
          </Badge>
        ) : occurrence.status === "taken" ? (
          <Badge variant="safe">
            <Check aria-hidden="true" className="size-3.5" />
            Taken
          </Badge>
        ) : (
          <Badge variant="expiring">
            <XCircle aria-hidden="true" className="size-3.5" />
            Skipped{skipReason ? ` · ${skipReasonLabel(skipReason)}` : ""}
          </Badge>
        )}
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col gap-1.5 sm:w-auto sm:items-end">
      {pending ? (
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          <Button
            size="sm"
            onClick={handleTake}
            disabled={isPending || outOfStock}
            aria-describedby={outOfStock ? "dose-out-of-stock" : undefined}
            className="h-11 md:h-9"
          >
            <Check aria-hidden="true" className="size-4" />
            Take
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDialogMode("skip")}
            disabled={isPending}
            className="h-11 md:h-9"
          >
            <XCircle aria-hidden="true" className="size-4" />
            Skip
          </Button>
        </div>
      ) : (
        <div className="flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto sm:justify-end">
          {occurrence.status === "taken" ? (
            <Badge variant="safe" className="motion-safe:animate-settle">
              <Check aria-hidden="true" className="size-3.5" />
              Taken
            </Badge>
          ) : (
            <Badge variant="expiring" className="motion-safe:animate-settle">
              <XCircle aria-hidden="true" className="size-3.5" />
              Skipped{skipReason ? ` · ${skipReasonLabel(skipReason)}` : ""}
            </Badge>
          )}

          {isPatient ? (
            <p className="max-w-64 text-[11px] leading-relaxed text-muted-foreground">
              {occurrence.status === "taken" ? "Marked taken." : "Marked skipped."}{" "}
              Ask a caregiver to correct it if this was a mistake.
            </p>
          ) : (
          <div className="flex items-center gap-1">
            {occurrence.status === "skipped" ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleMarkTaken}
                disabled={isPending}
                className="h-11 md:h-9"
              >
                <Check aria-hidden="true" className="size-4" />
                Mark taken
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDialogMode("undo")}
                disabled={isPending}
                className="h-11 md:h-9"
              >
                <RotateCcw aria-hidden="true" className="size-4" />
                Undo
              </Button>
            )}

            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDialogMode("skip")}
              disabled={isPending}
              className="h-11 md:h-9"
            >
              {occurrence.status === "skipped" ? "Change reason" : "Skip instead"}
            </Button>
          </div>
          )}
        </div>
      )}

      {pending && outOfStock ? (
        <p id="dose-out-of-stock" className="text-[11px] text-muted-foreground">
          {isPatient ? (
            <>No doses left. Log this dose as skipped or ask a caregiver to restock.</>
          ) : (
            <>
              No doses left.{" "}
              <Link
                href="/medicines?tab=inventory"
                className="font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
              >
                Restock
              </Link>{" "}
              or log this dose as skipped.
            </>
          )}
        </p>
      ) : null}

      {occurrence.status === "skipped" && occurrence.skipNote ? (
        <p
          className="max-w-56 truncate text-[11px] text-muted-foreground"
          title={occurrence.skipNote}
        >
          “{occurrence.skipNote}”
        </p>
      ) : null}

      <p aria-live="polite" role="status" className="sr-only">
        {announcement}
      </p>

      {error ? (
        <p role="alert" className="text-[11px] text-brick-ink">
          {error}
        </p>
      ) : null}

      <SkipDialog
        open={dialogMode !== null}
        onOpenChange={(open) => setDialogMode(open ? (dialogMode ?? "skip") : null)}
        mode={dialogMode ?? "skip"}
        initialReason={
          occurrence.skipReason ?? (outOfStock ? "out_of_stock" : null)
        }
        initialNote={occurrence.skipNote ?? ""}
        pending={isPending}
        onConfirm={handleSkip}
      />
    </div>
  )
}
