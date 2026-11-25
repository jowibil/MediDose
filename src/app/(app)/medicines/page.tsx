import Link from "next/link"
import { redirect } from "next/navigation"
import { Plus } from "lucide-react"

import { getSessionContext, resolveActivePatient } from "@/lib/auth"
import { getTimeZone } from "@/lib/timezone"
import { getMedicines, getStockMovements } from "@/lib/data"
import { getTodayInTimeZone, parseISODate } from "@/lib/dates"
import { PageHeader } from "@/components/page-header"
import { NoPatientState } from "@/components/no-patient-state"
import { Button } from "@/components/ui/button"
import {
  MedicinesTabs,
  isMedicinesTab,
} from "@/components/medicines/medicines-tabs"
import { CabinetTab } from "@/components/medicines/cabinet-tab"
import { InventoryTab } from "@/components/medicines/inventory-tab"
import { ExpirationTab } from "@/components/medicines/expiration-tab"

export const metadata = { title: "Medicines" }

export default async function MedicinesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const params = await searchParams
  const tab = isMedicinesTab(params.tab) ? params.tab : "cabinet"

  const context = await getSessionContext()
  if (!context) redirect("/login")
  // A patient account has no cabinet to manage; the nav hides this route, and
  // the server enforces it so a typed URL is not a way in.
  if (context.role === "patient") redirect("/dashboard")

  const active = await resolveActivePatient(context)
  if (!active) return <NoPatientState context={context} />

  const timeZone = await getTimeZone()
  const todayIso = getTodayInTimeZone(timeZone)
  const now = parseISODate(todayIso)
  const medicines = await getMedicines(active.id)
  const movements = await getStockMovements(medicines)

  return (
    <div>
      <PageHeader
        title="Medicines"
        description={`${active.name} · ${active.householdName}`}
        actions={
          context.role === "owner" ? (
            <Button asChild>
              <Link href={`/medicines/new?patient=${active.id}`}>
                <Plus aria-hidden="true" className="size-4" /> Add medicine
              </Link>
            </Button>
          ) : undefined
        }
      />

      <MedicinesTabs active={tab} />

      {tab === "cabinet" ? (
        <CabinetTab
          medicines={medicines}
          role={context.role}
          now={now}
          todayIso={todayIso}
          patientId={active.id}
        />
      ) : null}

      {tab === "inventory" ? (
        <InventoryTab
          medicines={medicines}
          role={context.role}
          now={now}
          todayIso={todayIso}
          movements={movements}
        />
      ) : null}

      {tab === "expiration" ? (
        <ExpirationTab
          medicines={medicines}
          role={context.role}
          now={now}
          todayIso={todayIso}
        />
      ) : null}
    </div>
  )
}
