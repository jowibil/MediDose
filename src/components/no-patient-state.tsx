import Link from "next/link"
import { Archive, KeyRound, UserRoundPlus } from "lucide-react"

import type { SessionContext } from "@/types/medicine"
import { Button } from "@/components/ui/button"
import { EmptySection } from "@/components/empty-section"
import { AddPatientForm } from "@/components/patients/add-patient-form"

export function NoPatientState({ context }: { context: SessionContext }) {
  // A patient account resolves to exactly one of three states, and each one has
  // a different remedy. The owner/caregiver copy below would be wrong for all
  // three: a patient cannot add patients or join a household.
  if (context.role === "patient") {
    if (context.patientState === "archived") {
      return (
        <EmptySection
          icon={Archive}
          title="Your patient record is archived"
          description="Ask your household owner to restore it in Settings. Your dose history is kept while it is archived."
        />
      )
    }

    return (
      <EmptySection
        icon={KeyRound}
        title="Link your patient record"
        description="Ask your household owner for a six-character link code, then enter it here. The code works once."
        action={
          <Button asChild>
            <Link href="/join?as=patient">Enter a link code</Link>
          </Button>
        }
      />
    )
  }

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
