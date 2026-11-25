import Link from "next/link"
import { redirect } from "next/navigation"
import { HeartHandshake, ShieldAlert } from "lucide-react"

import { getSessionContext, ownerHouseholdId } from "@/lib/auth"
import {
  getArchivedMedicines,
  getArchivedPatients,
  getCaregivers,
  getInviteCode,
  getMedicines,
  getPatientLinkInfo,
  getPatients,
  type PatientLinkInfo,
} from "@/lib/data"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { AddPatientForm } from "@/components/patients/add-patient-form"
import { RoleBadge } from "@/components/app-shell/role-badge"
import {
  ArchivedMedicineList,
  ArchivedPatientList,
  CaregiverRemoveButton,
  HouseholdNameForm,
  InviteCodeCard,
  PatientAdminList,
  ProfileNameForm,
} from "@/components/settings/settings-client"

export const metadata = { title: "Settings" }

function formatJoined(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso))
}

export default async function SettingsPage() {
  const context = await getSessionContext()
  if (!context) redirect("/login")
  // Settings is an owner surface. A patient account is redirected server-side
  // rather than shown an empty shell it has no actions for.
  if (context.role === "patient") redirect("/dashboard")

  const householdId = ownerHouseholdId(context)

  // Caregivers never see owner controls; the database enforces the same rule.
  if (!householdId) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Settings"
          description={`${context.displayName} · signed in as caregiver`}
          meta={<RoleBadge role="caregiver" />}
        />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HeartHandshake
                aria-hidden="true"
                className="size-4 text-sage-ink"
              />
              Settings are owner-only
            </CardTitle>
            <CardDescription>
              You are linked to{" "}
              {context.households.length === 1
                ? context.households[0]?.householdName
                : `${context.households.length} households`}
              . Your caregiver access lets you log doses and restock.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ul className="flex flex-col gap-2 text-sm">
              <li className="flex items-start gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-sage" />
                Log doses as taken or skipped, with a required skip reason.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-sage" />
                Restock medicines and correct a logged status.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                <span className="text-muted-foreground">
                  Adding, editing, archiving, or purging medicines and patients
                  stays with the household owner.
                </span>
              </li>
            </ul>

            <div className="rounded-xl border border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
              Need a change to the household, invite code, or caregiver list?
              Ask the owner — those controls are owner-only in the database too,
              not just hidden here.
            </div>

            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/dashboard">Back to dashboard</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/join">Join another household</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your account</CardTitle>
            <CardDescription>
              Your display name appears on every dose you log.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileNameForm displayName={context.displayName} />
          </CardContent>
        </Card>
      </div>
    )
  }

  const household = context.households.find(
    (group) => group.householdId === householdId,
  )

  const [inviteCode, caregivers, patients, archivedPatients, archivedMedicines] =
    await Promise.all([
      getInviteCode(householdId),
      getCaregivers(householdId),
      getPatients(householdId),
      getArchivedPatients(householdId),
      getArchivedMedicines(householdId),
    ])

  const activePatients = patients.filter((patient) => !patient.archivedAt)
  const medicineLists = await Promise.all(
    activePatients.map(async (patient) => ({
      patientId: patient.id,
      medicines: await getMedicines(patient.id),
    })),
  )
  const medicineCountByPatient = new Map(
    medicineLists.map((entry) => [entry.patientId, entry.medicines.length]),
  )
  const linkInfos = await Promise.all(
    activePatients.map(
      async (patient) =>
        [patient.id, await getPatientLinkInfo(patient.id)] as const,
    ),
  )
  const linkInfoByPatient = new Map<string, PatientLinkInfo>(linkInfos)
  const medicineNameByPatient = new Map(
    [...patients, ...archivedPatients].map((patient) => [
      patient.id,
      patient.name,
    ]),
  )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Settings"
        description={household?.householdName ?? "Your household"}
        meta={<RoleBadge role="owner" />}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Household</CardTitle>
            <CardDescription>
              Rename the shared household. Patients and caregivers see this name.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <HouseholdNameForm
              householdId={householdId}
              name={household?.householdName ?? "My household"}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Invite code</CardTitle>
            <CardDescription>
              Caregivers join by entering this code on the Join page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <InviteCodeCard householdId={householdId} initialCode={inviteCode} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            Caregivers
            <span className="text-sm font-normal tabular-nums text-muted-foreground">
              {caregivers.length}
            </span>
          </CardTitle>
          <CardDescription>
            They can view schedules, log taken/skipped, and restock. They cannot
            edit medicines or household settings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {caregivers.length === 0 ? (
            <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-border px-4 py-5">
              <p className="text-sm text-muted-foreground">
                No caregivers have joined yet.
              </p>
              <p className="text-xs text-muted-foreground">
                Share the invite code above. They create a caregiver account, then
                enter the code on the Join page.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {caregivers.map((caregiver) => (
                <li
                  key={caregiver.userId}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {caregiver.displayName}
                    </p>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      Joined {formatJoined(caregiver.joinedAt)}
                    </p>
                  </div>
                  <CaregiverRemoveButton
                    householdId={householdId}
                    userId={caregiver.userId}
                    displayName={caregiver.displayName}
                  />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card id="patients">
        <CardHeader>
          <CardTitle>Patients</CardTitle>
          <CardDescription>
            Add, rename, or archive patients. Archived patients keep their history
            but leave the patient selector.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <AddPatientForm />
          <PatientAdminList
            patients={activePatients.map((patient) => ({
              id: patient.id,
              name: patient.name,
              medicineCount: medicineCountByPatient.get(patient.id) ?? 0,
              link: linkInfoByPatient.get(patient.id) ?? {
                status: "none" as const,
                code: null,
              },
            }))}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Archived patients</CardTitle>
            <CardDescription>
              Restore to active views, or purge permanently with typed
              confirmation. Purge deletes all related history.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ArchivedPatientList
              patients={archivedPatients.map((patient) => ({
                id: patient.id,
                name: patient.name,
              }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Archived medicines</CardTitle>
            <CardDescription>
              Archived medicines stay readable in history until purged.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ArchivedMedicineList
              medicines={archivedMedicines.map((medicine) => ({
                id: medicine.id,
                name: medicine.name,
                patientName:
                  medicineNameByPatient.get(medicine.patientId) ?? "Patient",
              }))}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>
            Your display name appears on dose logs and in the account menu.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileNameForm displayName={context.displayName} />
        </CardContent>
      </Card>

      <div className="flex items-start gap-3 rounded-2xl border border-border/80 bg-muted/40 p-4 text-xs leading-relaxed text-muted-foreground">
        <ShieldAlert
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        />
        <p>
          <span className="font-medium text-foreground">Archive vs. purge.</span>{" "}
          Archiving hides an item but keeps every dose log and stock movement.
          Purging is permanent and cascades through medicines, dose history, and
          the stock ledger. There is no ownership transfer — keep your owner
          account safe.
        </p>
      </div>
    </div>
  )
}
