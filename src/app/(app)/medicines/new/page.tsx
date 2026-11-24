import Link from "next/link"
import { redirect } from "next/navigation"
import { ShieldAlert } from "lucide-react"

import { getSessionContext, ownerHouseholdId, resolveActivePatient } from "@/lib/auth"
import { getPatients } from "@/lib/data"
import { Button } from "@/components/ui/button"
import { EmptySection } from "@/components/empty-section"
import { PageHeader } from "@/components/page-header"
import { MedicineForm } from "@/components/medicines/medicine-form"

export const metadata = { title: "Add medicine" }

export default async function NewMedicinePage({
  searchParams,
}: {
  searchParams: Promise<{ patient?: string }>
}) {
  const params = await searchParams
  const context = await getSessionContext()
  if (!context) redirect("/login")

  const householdId = ownerHouseholdId(context)
  if (!householdId) {
    return (
      <EmptySection
        icon={ShieldAlert}
        title="Owner only"
        description="Caregivers can view, log doses, and restock, but only the household owner can add medicines."
        action={
          <Button asChild>
            <Link href="/medicines">Back to medicines</Link>
          </Button>
        }
      />
    )
  }

  const [active, patients] = await Promise.all([
    resolveActivePatient(context),
    getPatients(householdId),
  ])

  const available = patients
    .filter((patient) => !patient.archivedAt)
    .map((patient) => ({ id: patient.id, name: patient.name }))

  if (available.length === 0) {
    return (
      <EmptySection
        icon={ShieldAlert}
        title="Add a patient first"
        description="Medicines belong to a patient. Create one in Settings, then come back."
        action={
          <Button asChild>
            <Link href="/settings#patients">Add a patient</Link>
          </Button>
        }
      />
    )
  }

  const requested = params.patient
  const defaultPatientId =
    requested && available.some((patient) => patient.id === requested)
      ? requested
      : (active?.id ?? available[0].id)

  return (
    <div>
      <PageHeader
        title="Add medicine"
        description="The schedule is computed from the mode and frequency, then stored with the medicine."
      />
      <MedicineForm
        patients={available}
        defaultPatientId={defaultPatientId}
      />
    </div>
  )
}
