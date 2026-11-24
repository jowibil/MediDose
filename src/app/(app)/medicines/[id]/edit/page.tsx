import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ShieldAlert } from "lucide-react"

import { getSessionContext, ownerHouseholdId } from "@/lib/auth"
import { getMedicineById, getPatients } from "@/lib/data"
import { Button } from "@/components/ui/button"
import { EmptySection } from "@/components/empty-section"
import { PageHeader } from "@/components/page-header"
import { MedicineForm } from "@/components/medicines/medicine-form"

export const metadata = { title: "Edit medicine" }

export default async function EditMedicinePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const context = await getSessionContext()
  if (!context) redirect("/login")

  const householdId = ownerHouseholdId(context)
  if (!householdId) {
    return (
      <EmptySection
        icon={ShieldAlert}
        title="Owner only"
        description="Only the household owner can edit medicines."
        action={
          <Button asChild>
            <Link href="/medicines">Back to medicines</Link>
          </Button>
        }
      />
    )
  }

  const [medicine, patients] = await Promise.all([
    getMedicineById(id),
    getPatients(householdId),
  ])

  if (!medicine) notFound()

  const available = patients
    .filter((patient) => !patient.archivedAt)
    .map((patient) => ({ id: patient.id, name: patient.name }))

  if (!available.some((patient) => patient.id === medicine.patientId)) {
    notFound()
  }

  return (
    <div>
      <PageHeader
        title={`Edit ${medicine.name}`}
        description="Changes to stock are recorded in the audit ledger."
      />
      <MedicineForm
        patients={available}
        defaultPatientId={medicine.patientId}
        medicine={medicine}
      />
    </div>
  )
}
