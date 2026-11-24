import { TriangleAlert } from "lucide-react"

import type { ExpirationStatus, Medicine } from "@/types/medicine"
import { EXPIRING_SOON_THRESHOLD_DAYS } from "@/types/medicine"
import { daysUntil, formatDaysRemaining } from "@/lib/dates"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { EmptySection } from "@/components/empty-section"
import { SupplyBadge } from "@/components/medicine-badges"
import { ArchiveMedicineButton } from "@/components/medicines/medicine-actions"
import { RestockDialog } from "@/components/medicines/restock-dialog"

function statusFor(medicine: Medicine, todayIso: string): ExpirationStatus {
  const days = daysUntil(medicine.expirationDate, todayIso)
  if (days < 0) return "expired"
  if (days <= EXPIRING_SOON_THRESHOLD_DAYS) return "expiring"
  return "safe"
}

const COLUMNS: {
  status: ExpirationStatus
  title: string
  description: string
}[] = [
  {
    status: "safe",
    title: "Safe",
    description: `More than ${EXPIRING_SOON_THRESHOLD_DAYS} days remaining`,
  },
  {
    status: "expiring",
    title: "Expiring soon",
    description: `${EXPIRING_SOON_THRESHOLD_DAYS} days or fewer remaining`,
  },
  {
    status: "expired",
    title: "Expired",
    description: "Past the expiration date — dispose safely",
  },
]

export function ExpirationTab({
  medicines,
  role,
  now,
  todayIso,
}: {
  medicines: Medicine[]
  role: "owner" | "caregiver"
  now: Date
  todayIso: string
}) {
  if (medicines.length === 0) {
    return (
      <EmptySection
        icon={TriangleAlert}
        title="Nothing to track yet"
        description="Once medicines are added, they’ll be sorted here by shelf life: Safe, Expiring soon, or Expired."
      />
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {COLUMNS.map((column) => {
        const items = medicines.filter(
          (medicine) => statusFor(medicine, todayIso) === column.status,
        )
        return (
          <Card key={column.status} className="flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 tracking-tight">
                <Badge variant={column.status}>{items.length}</Badge>
                {column.title}
              </CardTitle>
              <CardDescription>{column.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-2">
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing here.</p>
              ) : (
                items.map((medicine) => (
                  <div
                    key={medicine.id}
                    className="rounded-xl border border-border/50 px-3 py-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{medicine.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDaysRemaining(
                            medicine.expirationDate,
                            todayIso,
                          )}
                        </p>
                      </div>
                      {role === "owner" ? (
                        <ArchiveMedicineButton
                          medicineId={medicine.id}
                          medicineName={medicine.name}
                        />
                      ) : null}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <SupplyBadge medicine={medicine} now={now} />
                      {column.status !== "expired" ? (
                        <RestockDialog
                          medicineId={medicine.id}
                          medicineName={medicine.name}
                          stock={medicine.stock}
                        />
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
