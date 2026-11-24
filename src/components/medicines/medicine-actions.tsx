"use client"

import { Archive } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { archiveMedicineAction } from "@/lib/actions/medicines"

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

