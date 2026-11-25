import Link from "next/link"
import { Pencil, PillBottle, Plus } from "lucide-react"

import type { Medicine } from "@/types/medicine"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { EmptySection } from "@/components/empty-section"
import {
  ExpirationBadge,
  SupplyBadge,
  SupplyMeter,
} from "@/components/medicine-badges"
import {
  ArchiveMedicineButton,
  DisposeMedicineButton,
} from "@/components/medicines/medicine-actions"
import { RestockDialog } from "@/components/medicines/restock-dialog"
import { formatTime12h } from "@/lib/schedule"
import { formatDosage } from "@/lib/mappers"

const MODE_LABEL = {
  waking_hours: "Waking hours",
  strict_interval: "Strict intervals",
  custom: "Custom times",
} as const

export function CabinetTab({
  medicines,
  role,
  now,
  todayIso,
  patientId,
}: {
  medicines: Medicine[]
  role: "owner" | "caregiver"
  now: Date
  todayIso: string
  patientId: string
}) {
  if (medicines.length === 0) {
    return (
      <EmptySection
        icon={PillBottle}
        title="The cabinet is empty"
        description={
          role === "owner"
            ? "Add a medicine to generate its schedule, track stock, and watch its expiration date."
            : "No medicines have been added for this patient yet. The household owner can add them."
        }
        action={
          role === "owner" ? (
            <Button asChild>
              <Link href={`/medicines/new?patient=${patientId}`}>
                <Plus aria-hidden="true" className="size-4" /> Add medicine
              </Link>
            </Button>
          ) : undefined
        }
      />
    )
  }

  return (
    <div>
      {role === "caregiver" ? (
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <Badge variant="outline" className="shrink-0">
            Read-only
          </Badge>
          You can log doses and restock. Editing, archiving, and adding medicines
          stays with the household owner.
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {medicines.map((medicine) => (
          <article
            key={medicine.id}
            className="flex flex-col gap-3 rounded-2xl border border-border/80 bg-card p-5 shadow-card transition-shadow duration-200 hover:shadow-lift"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate font-display text-lg leading-tight font-medium">
                  {medicine.name}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDosage(medicine.dosageAmount, medicine.dosageUnit)} ·{" "}
                  {medicine.frequencyPerDay}× per day
                </p>
              </div>
              <SupplyBadge medicine={medicine} now={now} />
            </div>

            <SupplyMeter medicine={medicine} now={now} />

            <div className="flex flex-wrap items-center gap-1.5">
              {medicine.scheduleTimes.map((time) => (
                <span
                  key={time}
                  className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground"
                >
                  {formatTime12h(time)}
                </span>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <ExpirationBadge
                expirationDate={medicine.expirationDate}
                todayIso={todayIso}
              />
              <Badge variant="outline">{MODE_LABEL[medicine.scheduleMode]}</Badge>
              {medicine.treatmentEndDate ? (
                <Badge variant="secondary">
                  Until {medicine.treatmentEndDate}
                </Badge>
              ) : null}
            </div>

            <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
              <RestockDialog
                medicineId={medicine.id}
                medicineName={medicine.name}
                stock={medicine.stock}
              />
              {role === "owner" ? (
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" asChild>
                    <Link href={`/medicines/${medicine.id}/edit`}>
                      <Pencil aria-hidden="true" className="size-4" />
                      Edit
                    </Link>
                  </Button>
                  <DisposeMedicineButton
                    medicineId={medicine.id}
                    medicineName={medicine.name}
                  />
                  <ArchiveMedicineButton
                    medicineId={medicine.id}
                    medicineName={medicine.name}
                  />
                </div>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
