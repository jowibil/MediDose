import { AlertTriangle, ClipboardList } from "lucide-react"

import type { Medicine } from "@/types/medicine"
import type { StockMovement } from "@/lib/data"
import { isLowStock, isOutOfStock, needsRestock } from "@/lib/inventory"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { EmptySection } from "@/components/empty-section"
import { ExpirationBadge, SupplyBadge } from "@/components/medicine-badges"
import { RestockDialog, StockStepper } from "@/components/medicines/restock-dialog"
import { ArchiveMedicineButton } from "@/components/medicines/medicine-actions"
import { calculateSupply } from "@/lib/supply"
import { formatDosage } from "@/lib/mappers"

const REASON_LABELS: Record<StockMovement["reason"], string> = {
  initial: "Initial stock",
  dose_taken: "Dose taken",
  dose_reverted: "Dose reverted",
  restock: "Restock",
  owner_edit: "Owner edit",
  disposed: "Disposed",
  dispose_reverted: "Disposal undone",
}

/** Legacy threshold label kept alongside the supply badge. */
function LegacyStockBadge({ medicine }: { medicine: Medicine }) {
  if (isOutOfStock(medicine)) return null
  if (isLowStock(medicine)) return <Badge variant="expiring">Low stock</Badge>
  return <Badge variant="safe">In stock</Badge>
}

function formatMovementTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso))
}

export function InventoryTab({
  medicines,
  role,
  now,
  todayIso,
  movements,
}: {
  medicines: Medicine[]
  role: "owner" | "caregiver"
  now: Date
  todayIso: string
  movements: StockMovement[]
}) {
  if (medicines.length === 0) {
    return (
      <EmptySection
        icon={ClipboardList}
        title="The ledger is empty"
        description="Stock counts will appear here and decrement automatically as doses are marked taken."
      />
    )
  }

  const restockNeeded = medicines.filter((medicine) =>
    needsRestock(medicine, now),
  )

  return (
    <div className="flex flex-col gap-6">
      {restockNeeded.length > 0 ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber/35 bg-amber-soft/70 px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-medium text-amber-ink">
            <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />
            Restock needed
          </p>
          <ul className="flex flex-col gap-2 divide-y divide-amber/20">
            {restockNeeded.map((medicine) => {
              const supply = calculateSupply(
                medicine.stock,
                medicine.frequencyPerDay,
                now,
              )
              return (
                <li
                  key={medicine.id}
                  className="flex flex-col gap-2 pt-2 text-sm first:pt-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                >
                  <div>
                    <span className="font-medium">{medicine.name}</span>{" "}
                    <span className="text-xs text-muted-foreground">
                      · {supply.label}
                    </span>
                  </div>
                  <RestockDialog
                    medicineId={medicine.id}
                    medicineName={medicine.name}
                    stock={medicine.stock}
                  />
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Inventory ledger</CardTitle>
          <CardDescription>
            Live stock counts for the active patient. Taken doses decrement
            stock; skipped doses don’t.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-3 md:hidden">
            {medicines.map((medicine) => (
              <li
                key={medicine.id}
                className="flex flex-col gap-3 rounded-2xl border border-border/50 bg-card p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{medicine.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDosage(medicine.dosageAmount, medicine.dosageUnit)} ·{" "}
                      {medicine.frequencyPerDay}x/day
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <SupplyBadge medicine={medicine} now={now} />
                    <LegacyStockBadge medicine={medicine} />
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-2">
                  {role === "owner" ? (
                    <StockStepper
                      medicineId={medicine.id}
                      stock={medicine.stock}
                    />
                  ) : (
                    <Badge variant={isOutOfStock(medicine) ? "expired" : "safe"}>
                      {medicine.stock} doses
                    </Badge>
                  )}
                  <div className="flex items-center gap-1.5">
                    <ExpirationBadge
                      expirationDate={medicine.expirationDate}
                      todayIso={todayIso}
                    />
                    <RestockDialog
                      medicineId={medicine.id}
                      medicineName={medicine.name}
                      stock={medicine.stock}
                    />
                    {role === "owner" ? (
                      <ArchiveMedicineButton
                        medicineId={medicine.id}
                        medicineName={medicine.name}
                      />
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="border-b border-border/70 py-2 pr-3 font-medium">
                    Medicine
                  </th>
                  <th className="border-b border-border/60 px-2 py-2 font-medium">
                    Dosage
                  </th>
                  <th className="border-b border-border/60 px-2 py-2 font-medium">
                    Stock
                  </th>
                  <th className="border-b border-border/60 px-2 py-2 font-medium">
                    Supply
                  </th>
                  <th className="border-b border-border/60 px-2 py-2 font-medium">
                    Expiration
                  </th>
                  <th className="border-b border-border/60 py-2 pl-2 text-right font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {medicines.map((medicine) => (
                  <tr key={medicine.id} className="transition-colors hover:bg-muted/20">
                    <td className="border-b border-border/60 py-3 pr-3 font-medium">
                      {medicine.name}
                    </td>
                    <td className="border-b border-border/60 px-2 py-3 text-muted-foreground">
                      {formatDosage(medicine.dosageAmount, medicine.dosageUnit)} ·{" "}
                      {medicine.frequencyPerDay}x/day
                    </td>
                    <td className="border-b border-border/60 px-2 py-3">
                      {role === "owner" ? (
                        <StockStepper
                          medicineId={medicine.id}
                          stock={medicine.stock}
                        />
                      ) : (
                        <span className="tabular-nums">{medicine.stock}</span>
                      )}
                    </td>
                    <td className="border-b border-border/60 px-2 py-3">
                      <div className="flex flex-wrap items-center gap-1">
                        <SupplyBadge medicine={medicine} now={now} />
                        <LegacyStockBadge medicine={medicine} />
                      </div>
                    </td>
                    <td className="border-b border-border/60 px-2 py-3">
                      <ExpirationBadge
                        expirationDate={medicine.expirationDate}
                        todayIso={todayIso}
                      />
                    </td>
                    <td className="border-b border-border/60 py-3 pl-2">
                      <div className="flex items-center justify-end gap-1.5">
                        <RestockDialog
                          medicineId={medicine.id}
                          medicineName={medicine.name}
                          stock={medicine.stock}
                        />
                        {role === "owner" ? (
                          <ArchiveMedicineButton
                            medicineId={medicine.id}
                            medicineName={medicine.name}
                          />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent stock movements</CardTitle>
          <CardDescription>
            The last 20 audited changes across this patient’s medicines.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {movements.length === 0 ? (
            <p className="text-sm text-muted-foreground">No stock changes yet.</p>
          ) : (
            <ul className="divide-y divide-border/50">
              {movements.map((movement) => (
                <li
                  key={movement.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm first:pt-0 last:pb-0"
                >
                  <div>
                    <span className="font-medium">{movement.medicineName}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {REASON_LABELS[movement.reason]}
                      {movement.actorName ? ` · ${movement.actorName}` : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      {formatMovementTime(movement.createdAt)}
                    </span>
                    <span
                      className={
                        movement.delta > 0
                          ? "font-mono text-xs font-semibold text-sage"
                          : "font-mono text-xs font-semibold text-brick"
                      }
                    >
                      {movement.delta > 0 ? "+" : ""}
                      {movement.delta}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
