"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Archive, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useDisposeUndo } from "@/components/medicines/dispose-undo-context"
import {
  archiveMedicineAction,
  disposeMedicineAction,
} from "@/lib/actions/medicines"
import type { ActionResult } from "@/lib/action-result"

export function ArchiveMedicineButton({
  medicineId,
  medicineName,
}: {
  medicineId: string
  medicineName: string
}) {
  return (
    <ConfirmDialog
      trigger={
        <Button size="sm" variant="ghost" aria-label={`Archive ${medicineName}`}>
          <Archive className="size-4 text-muted-foreground" />
        </Button>
      }
      title="Archive this medicine?"
      description={
        <>
          <span className="font-medium text-foreground">{medicineName}</span>{" "}
          leaves the cabinet, inventory, and schedules. Its dose history stays
          available, and you can restore or purge it from Settings.
        </>
      }
      confirmLabel="Archive"
      onConfirm={() => archiveMedicineAction(medicineId)}
    />
  )
}

/**
 * Disposal. In the expired column it is one click (the medicine has already
 * failed its shelf life); in the cabinet it asks first, because there the
 * reason is a mistake or damage and the stock may still be worth keeping.
 */
export function DisposeMedicineButton({
  medicineId,
  medicineName,
  oneClick = false,
}: {
  medicineId: string
  medicineName: string
  oneClick?: boolean
}) {
  const router = useRouter()
  const { announce } = useDisposeUndo()
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function dispose(): Promise<ActionResult> {
    const result = await disposeMedicineAction(medicineId)
    if (!result.ok) return result
    announce({
      medicineId,
      medicineName,
      discarded: result.data.discarded,
    })
    return { ok: true, data: null }
  }

  if (oneClick) {
    return (
      <span className="inline-flex flex-col items-end gap-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label={`Dispose ${medicineName}`}
          disabled={isPending}
          onClick={() => {
            setError(null)
            startTransition(async () => {
              const result = await dispose()
              if (!result.ok) setError(result.error)
              // The dialog refreshes itself; a bare button has to do it here.
              else router.refresh()
            })
          }}
        >
          <Trash2 aria-hidden="true" className="size-4" />
          {isPending ? "Disposing…" : "Dispose"}
        </Button>
        {error ? (
          <span role="alert" className="text-[11px] text-destructive">
            {error}
          </span>
        ) : null}
      </span>
    )
  }

  return (
    <ConfirmDialog
      trigger={
        <Button
          size="sm"
          variant="ghost"
          aria-label={`Dispose ${medicineName}`}
        >
          <Trash2 className="size-4 text-muted-foreground" />
          Dispose…
        </Button>
      }
      title="Dispose this medicine?"
      description={
        <>
          <span className="font-medium text-foreground">{medicineName}</span>{" "}
          discards the remaining stock and archives the medicine, keeping its
          dose history readable. Use it for a medicine added by mistake or a
          damaged supply. To delete a record entirely, purge it from Settings.
        </>
      }
      confirmLabel="Dispose"
      onConfirm={dispose}
    />
  )
}

