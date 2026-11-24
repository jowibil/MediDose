"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, Copy, Pencil, RefreshCcw, UserMinus, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  archivePatientAction,
  purgePatientAction,
  renamePatientAction,
  restorePatientAction,
} from "@/lib/actions/patients"
import {
  purgeMedicineAction,
  restoreMedicineAction,
} from "@/lib/actions/medicines"
import {
  regenerateInviteCodeAction,
  removeCaregiverAction,
  renameHouseholdAction,
  updateProfileAction,
} from "@/lib/actions/household"
import type { ActionResult } from "@/lib/action-result"

export function HouseholdNameForm({
  householdId,
  name,
}: {
  householdId: string
  name: string
}) {
  const router = useRouter()
  const [value, setValue] = useState(name)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        setError(null)
        setSaved(false)
        startTransition(async () => {
          const result = await renameHouseholdAction(householdId, value)
          if (!result.ok) {
            setError(result.error)
            return
          }
          setSaved(true)
          router.refresh()
        })
      }}
    >
      <Label htmlFor="household-name">Household name</Label>
      <div className="flex flex-wrap gap-2">
        <Input
          id="household-name"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="max-w-xs"
        />
        <Button type="submit" disabled={isPending || !value.trim()}>
          {isPending ? "Saving…" : "Save"}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="text-xs text-sage">
          Household name updated.
        </p>
      ) : null}
    </form>
  )
}

export function ProfileNameForm({ displayName }: { displayName: string }) {
  const router = useRouter()
  const [value, setValue] = useState(displayName)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        setError(null)
        setSaved(false)
        startTransition(async () => {
          const result = await updateProfileAction(value)
          if (!result.ok) {
            setError(result.error)
            return
          }
          setSaved(true)
          router.refresh()
        })
      }}
    >
      <Label htmlFor="display-name">Display name</Label>
      <div className="flex flex-wrap gap-2">
        <Input
          id="display-name"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="max-w-xs"
        />
        <Button type="submit" disabled={isPending || !value.trim()}>
          {isPending ? "Saving…" : "Save"}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="text-xs text-sage">
          Display name updated.
        </p>
      ) : null}
    </form>
  )
}

export function InviteCodeCard({
  householdId,
  initialCode,
}: {
  householdId: string
  initialCode: string | null
}) {
  const [code, setCode] = useState(initialCode)
  const [copied, setCopied] = useState(false)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <code className="rounded-xl border border-border/60 bg-muted/40 px-4 py-2 font-mono text-2xl tracking-[0.3em]">
          {code ?? "Unavailable"}
        </code>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!code}
          onClick={async () => {
            if (!code) return
            try {
              await navigator.clipboard.writeText(code)
              setCopied(true)
              window.setTimeout(() => setCopied(false), 2000)
            } catch {
              setCopied(false)
            }
          }}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "Copied" : "Copy code"}
        </Button>

        <ConfirmDialog
          trigger={
            <Button type="button" size="sm" variant="outline">
              <RefreshCcw className="size-4" />
              Regenerate
            </Button>
          }
          title="Regenerate the invite code?"
          description="The old code stops working immediately. Caregivers already linked keep their access."
          confirmLabel="Regenerate"
          destructive={false}
          onConfirm={async (): Promise<ActionResult> => {
            const result = await regenerateInviteCodeAction(householdId)
            if (!result.ok) return result
            setCode(result.data.code)
            return { ok: true, data: null }
          }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Share this six-character code out-of-band. It contains no zeros, O’s,
        ones, or I’s.
      </p>
    </div>
  )
}

export function CaregiverRemoveButton({
  householdId,
  userId,
  displayName,
}: {
  householdId: string
  userId: string
  displayName: string
}) {
  return (
    <ConfirmDialog
      trigger={
        <Button size="sm" variant="ghost" aria-label={`Remove ${displayName}`}>
          <UserMinus className="size-4 text-destructive" />
        </Button>
      }
      title="Remove this caregiver?"
      description={
        <>
          <span className="font-medium text-foreground">{displayName}</span> loses
          access immediately. Their historical dose logs stay intact.
        </>
      }
      confirmLabel="Remove caregiver"
      onConfirm={() => removeCaregiverAction(householdId, userId)}
    />
  )
}

export function PatientAdminList({
  patients,
}: {
  patients: { id: string; name: string; medicineCount: number }[]
}) {
  const router = useRouter()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-2">
      {patients.length === 0 ? (
        <p className="text-sm text-muted-foreground">No active patients.</p>
      ) : (
        <ul className="divide-y divide-border/50">
          {patients.map((patient) => (
            <li
              key={patient.id}
              className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0"
            >
              {editingId === patient.id ? (
                <form
                  className="flex flex-wrap items-center gap-2"
                  onSubmit={(event) => {
                    event.preventDefault()
                    setError(null)
                    void renamePatientAction(patient.id, editName).then(
                      (result) => {
                        if (!result.ok) {
                          setError(result.error)
                          return
                        }
                        setEditingId(null)
                        router.refresh()
                      },
                    )
                  }}
                >
                  <Input
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    aria-label="Patient name"
                    className="max-w-52"
                  />
                  <Button type="submit" size="sm">
                    Save
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingId(null)}
                  >
                    <X className="size-4" />
                  </Button>
                </form>
              ) : (
                <>
                  <span className="text-sm font-medium">{patient.name}</span>
                  <span className="flex items-center gap-1">
                    <span className="mr-2 text-xs text-muted-foreground">
                      {patient.medicineCount} medicine
                      {patient.medicineCount === 1 ? "" : "s"}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingId(patient.id)
                        setEditName(patient.name)
                      }}
                      aria-label={`Rename ${patient.name}`}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    {patient.medicineCount > 0 ? (
                      <ConfirmDialog
                        trigger={
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`Archive ${patient.name}`}
                          >
                            Archive
                          </Button>
                        }
                        title="Archive this patient?"
                        description={
                          <>
                            {patient.name} has {patient.medicineCount} active
                            medicine{patient.medicineCount === 1 ? "" : "s"}.
                            Archiving hides the patient and their medicines from
                            active views but keeps their history.
                          </>
                        }
                        confirmLabel="Archive patient"
                        onConfirm={() => archivePatientAction(patient.id)}
                      />
                    ) : (
                      <ConfirmDialog
                        trigger={
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`Archive ${patient.name}`}
                          >
                            Archive
                          </Button>
                        }
                        title="Archive this patient?"
                        description={`${patient.name} will be hidden from the patient selector. Their history stays available.`}
                        confirmLabel="Archive patient"
                        onConfirm={() => archivePatientAction(patient.id)}
                      />
                    )}
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function ArchivedPatientList({
  patients,
}: {
  patients: { id: string; name: string }[]
}) {
  if (patients.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No archived patients.</p>
    )
  }

  return (
    <ul className="divide-y divide-border/50">
      {patients.map((patient) => (
        <li
          key={patient.id}
          className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0"
        >
          <span className="text-sm">{patient.name}</span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void restorePatientAction(patient.id)
              }}
            >
              Restore
            </Button>
            <ConfirmDialog
              trigger={
                <Button size="sm" variant="ghost">
                  Purge
                </Button>
              }
              title="Permanently delete this patient?"
              description="This removes the patient, every medicine, all dose history, and all stock movements. This cannot be undone."
              confirmLabel="Purge permanently"
              requireText={patient.name}
              onConfirm={() => purgePatientAction(patient.id)}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

export function ArchivedMedicineList({
  medicines,
}: {
  medicines: { id: string; name: string; patientName: string }[]
}) {
  if (medicines.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No archived medicines.</p>
    )
  }

  return (
    <ul className="divide-y divide-border/50">
      {medicines.map((medicine) => (
        <li
          key={medicine.id}
          className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0"
        >
          <span className="text-sm">
            <span className="font-medium">{medicine.name}</span>{" "}
            <span className="text-xs text-muted-foreground">
              · {medicine.patientName}
            </span>
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void restoreMedicineAction(medicine.id)
              }}
            >
              Restore
            </Button>
            <ConfirmDialog
              trigger={
                <Button size="sm" variant="ghost">
                  Purge
                </Button>
              }
              title="Permanently delete this medicine?"
              description="This removes the medicine, every dose log, and all stock movements. This cannot be undone."
              confirmLabel="Purge permanently"
              requireText={medicine.name}
              onConfirm={() => purgeMedicineAction(medicine.id)}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

