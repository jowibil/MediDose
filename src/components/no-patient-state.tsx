import Link from "next/link"
import { UserRoundPlus } from "lucide-react"

import type { SessionContext } from "@/types/medicine"
import { Button } from "@/components/ui/button"
import { EmptySection } from "@/components/empty-section"
import { AddPatientForm } from "@/components/patients/add-patient-form"

export function NoPatientState({ context }: { context: SessionContext }) {
  if (context.role === "owner") {
    return (
      <div className="flex flex-col gap-4">
        <EmptySection
          icon={UserRoundPlus}
          title="Add your first patient"
          description="Patients hold the medicines, schedules, and history for your household. You can add more later in Settings."
        />
        <div className="flex justify-center">
          <AddPatientForm autoFocus />
        </div>
      </div>
    )
  }

  return (
    <EmptySection
      icon={UserRoundPlus}
      title="No patients yet"
      description="Join a household with a six-character invite code to see its patients and medicines."
      action={
        <Button asChild>
          <Link href="/join">Join a household</Link>
        </Button>
      }
    />
  )
}
