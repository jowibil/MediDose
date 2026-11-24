"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Check, RotateCcw, XCircle } from "lucide-react"

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
  type SkipReason,
} from "@/types/medicine"

export function DoseControls({
  occurrence,
  stock,
  timeZone,
}: {
  occurrence: DoseOccurrence
  stock: number
  timeZone: string
}) {
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
        </div>
      )}

      {pending && outOfStock ? (
        <p id="dose-out-of-stock" className="text-[11px] text-muted-foreground">
          No doses left.{" "}
          <Link
            href="/medicines?tab=inventory"
            className="font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
          >
            Restock
          </Link>{" "}
          or log this dose as skipped.
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
