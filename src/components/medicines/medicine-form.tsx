"use client"

import { useId, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Info, Plus, Save } from "lucide-react"

import type { DoseUnit, Medicine, ScheduleMode } from "@/types/medicine"
import { MAX_FREQUENCY, MIN_FREQUENCY } from "@/types/medicine"
import type { MedicineFormErrors, MedicineFormValues } from "@/lib/validation"
import { hasErrors, validateMedicineForm } from "@/lib/validation"
import { calculateSupply, supplyBadgeVariant } from "@/lib/supply"
import { formatTime12h, timeSlotsForFrequency } from "@/lib/schedule"
import { saveMedicineAction } from "@/lib/actions/medicines"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const NEW_PATIENT = "__new__"

function initialValues(
  medicine: Medicine | undefined,
  defaultPatientId: string,
): MedicineFormValues {
  if (!medicine) {
    return {
      name: "",
      patientId: defaultPatientId,
      newPatientName: "",
      dosageAmount: "",
      dosageUnit: "mg",
      stock: "",
      expirationDate: "",
      frequencyPerDay: "1",
      firstDoseTime: "08:00",
      treatmentEndDate: "",
      scheduleMode: "waking_hours",
      customTimes: ["08:00"],
    }
  }

  return {
    name: medicine.name,
    patientId: medicine.patientId,
    newPatientName: "",
    dosageAmount: String(medicine.dosageAmount),
    dosageUnit: medicine.dosageUnit,
    stock: String(medicine.stock),
    expirationDate: medicine.expirationDate,
    frequencyPerDay: String(medicine.frequencyPerDay),
    firstDoseTime: medicine.firstDoseTime,
    treatmentEndDate: medicine.treatmentEndDate ?? "",
    scheduleMode: medicine.scheduleMode,
    customTimes:
      medicine.customTimes && medicine.customTimes.length > 0
        ? medicine.customTimes
        : [medicine.firstDoseTime],
  }
}

export function MedicineForm({
  patients,
  defaultPatientId,
  medicine,
}: {
  patients: { id: string; name: string }[]
  defaultPatientId: string
  medicine?: Medicine
}) {
  const router = useRouter()
  const [values, setValues] = useState<MedicineFormValues>(() =>
    initialValues(medicine, defaultPatientId),
  )
  const [errors, setErrors] = useState<MedicineFormErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const frequency = Number(values.frequencyPerDay) || 1
  const previewSupply = calculateSupply(Number(values.stock), frequency)
  const previewSlots = timeSlotsForFrequency(
    frequency,
    values.firstDoseTime || "08:00",
    values.scheduleMode,
    values.scheduleMode === "custom" ? values.customTimes : [],
  )

  function setField<K extends keyof MedicineFormValues>(
    key: K,
    value: MedicineFormValues[K],
  ) {
    setValues((previous) => ({ ...previous, [key]: value }))
  }

  function handleFrequencyChange(next: string) {
    setField("frequencyPerDay", next)
    const nextFrequency = Number(next)
    if (values.scheduleMode === "custom" && Number.isInteger(nextFrequency)) {
      const times = [...values.customTimes]
      while (times.length < nextFrequency) times.push("12:00")
      times.splice(nextFrequency)
      setField("customTimes", times)
    }
  }

  function handleModeChange(mode: ScheduleMode) {
    setField("scheduleMode", mode)
    if (mode === "custom") {
      const count = Number(values.frequencyPerDay) || 1
      setField(
        "customTimes",
        Array.from(
          { length: count },
          (_, index) => values.customTimes[index] ?? values.firstDoseTime ?? "08:00",
        ),
      )
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    const nextErrors = validateMedicineForm(values, {
      todayIso: new Date().toISOString().slice(0, 10),
    })
    setErrors(nextErrors)
    if (hasErrors(nextErrors)) {
      setError("Please fix the highlighted fields.")
      return
    }

    startTransition(async () => {
      const result = await saveMedicineAction(values, medicine?.id)
      if (!result.ok) {
        setError(result.error)
        setErrors(result.fieldErrors ?? {})
        return
      }
      router.push("/medicines")
      router.refresh()
    })
  }

  return (
    <Card>
      <CardContent className="pt-5">
        <form className="flex flex-col gap-8" onSubmit={handleSubmit} noValidate>
          <fieldset className="flex flex-col gap-4">
            <legend className="mb-1 w-full border-b border-border/60 pb-2 font-display text-base font-medium">
              Dosage
            </legend>

            <Field
              label="Patient"
              error={errors.patientId}
              htmlFor="medicine-patient"
            >
              <Select
                value={values.patientId}
                onValueChange={(value) => setField("patientId", value)}
              >
                <SelectTrigger
                  id="medicine-patient"
                  aria-invalid={Boolean(errors.patientId)}
                  aria-describedby={
                    errors.patientId ? "medicine-patient-error" : undefined
                  }
                >
                  <SelectValue placeholder="Choose a patient" />
                </SelectTrigger>
                <SelectContent>
                  {patients.map((patient) => (
                    <SelectItem key={patient.id} value={patient.id}>
                      {patient.name}
                    </SelectItem>
                  ))}
                  <SelectItem value={NEW_PATIENT}>+ New patient…</SelectItem>
                </SelectContent>
              </Select>

              {values.patientId === NEW_PATIENT ? (
                <Input
                  className="mt-2"
                  placeholder="New patient name"
                  value={values.newPatientName}
                  aria-invalid={Boolean(errors.newPatientName)}
                  aria-label="New patient name"
                  onChange={(event) =>
                    setField("newPatientName", event.target.value)
                  }
                />
              ) : null}
              {errors.newPatientName ? (
                <p className="mt-1 text-xs text-brick-ink">
                  {errors.newPatientName}
                </p>
              ) : null}
            </Field>

            <Field
              label="Medicine name"
              error={errors.name}
              htmlFor="medicine-name"
            >
              <Input
                id="medicine-name"
                placeholder="e.g. Amoxicillin"
                value={values.name}
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? "medicine-name-error" : undefined}
                onChange={(event) => setField("name", event.target.value)}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Dosage amount"
                error={errors.dosageAmount}
                htmlFor="medicine-dosage"
              >
                <div className="flex gap-2">
                  <Input
                    id="medicine-dosage"
                    type="number"
                    min={0}
                    step="any"
                    placeholder="500"
                    value={values.dosageAmount}
                    aria-invalid={Boolean(errors.dosageAmount)}
                    aria-describedby={
                      errors.dosageAmount ? "medicine-dosage-error" : undefined
                    }
                    onChange={(event) =>
                      setField("dosageAmount", event.target.value)
                    }
                  />
                  <Select
                    value={values.dosageUnit}
                    onValueChange={(value) =>
                      setField("dosageUnit", value as DoseUnit)
                    }
                  >
                    <SelectTrigger
                      className="w-24 shrink-0"
                      aria-label="Dosage unit"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mg">mg</SelectItem>
                      <SelectItem value="ml">ml</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </Field>

              <Field
                label="Frequency (doses per day)"
                error={errors.frequencyPerDay}
                htmlFor="medicine-frequency"
              >
                <Select
                  value={values.frequencyPerDay}
                  onValueChange={handleFrequencyChange}
                >
                  <SelectTrigger
                    id="medicine-frequency"
                    aria-invalid={Boolean(errors.frequencyPerDay)}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from(
                      { length: MAX_FREQUENCY - MIN_FREQUENCY + 1 },
                      (_, index) => index + MIN_FREQUENCY,
                    ).map((count) => (
                      <SelectItem key={count} value={String(count)}>
                        {count}× per day
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-4">
            <legend className="mb-1 w-full border-b border-border/60 pb-2 font-display text-base font-medium">
              Schedule
            </legend>

            <Field label="Schedule option" htmlFor="medicine-mode">
              <div className="flex items-center gap-1.5">
                <div className="flex-1">
                  <Select
                    value={values.scheduleMode}
                    onValueChange={(value) =>
                      handleModeChange(value as ScheduleMode)
                    }
                  >
                    <SelectTrigger id="medicine-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="waking_hours">
                        Waking hours (default)
                      </SelectItem>
                      <SelectItem value="strict_interval">
                        Strict: every N hours
                      </SelectItem>
                      <SelectItem value="custom">Custom: specific times</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <ScheduleModeInfo />
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                {values.scheduleMode === "waking_hours" &&
                  "Spreads doses evenly between the first dose and 10:00 PM."}
                {values.scheduleMode === "strict_interval" &&
                  "Calculates exact 24-hour intervals (e.g. 4×/day = every 6 hours)."}
                {values.scheduleMode === "custom" &&
                  "Lets you set an exact clock time for every dose."}
              </p>
            </Field>

            {values.scheduleMode !== "custom" ? (
              <Field
                label="First dose time"
                error={errors.firstDoseTime}
                htmlFor="medicine-first-dose"
              >
                <Input
                  id="medicine-first-dose"
                  type="time"
                  value={values.firstDoseTime}
                  aria-invalid={Boolean(errors.firstDoseTime)}
                  onChange={(event) =>
                    setField("firstDoseTime", event.target.value)
                  }
                />
              </Field>
            ) : (
              <Field label="Custom dose times" error={errors.customTimes}>
                <div className="grid gap-2 sm:grid-cols-3">
                  {Array.from({ length: frequency }).map((_, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Label
                        htmlFor={`medicine-custom-${index}`}
                        className="shrink-0 text-xs font-normal text-muted-foreground"
                      >
                        Dose {index + 1}
                      </Label>
                      <Input
                        id={`medicine-custom-${index}`}
                        type="time"
                        value={values.customTimes[index] ?? "08:00"}
                        onChange={(event) => {
                          const next = [...values.customTimes]
                          next[index] = event.target.value
                          setField("customTimes", next)
                        }}
                      />
                    </div>
                  ))}
                </div>
              </Field>
            )}

            <div className="rounded-xl border border-border/80 bg-muted/40 px-3 py-2.5">
              <p className="text-xs text-muted-foreground">
                Daily slots ·{" "}
                <span className="font-medium text-foreground">
                  {previewSlots.length} per day
                </span>
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {previewSlots.map((time) => (
                  <span
                    key={time}
                    className="rounded-md bg-card px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground"
                  >
                    {formatTime12h(time)}
                  </span>
                ))}
              </div>
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-4">
            <legend className="mb-1 w-full border-b border-border/60 pb-2 font-display text-base font-medium">
              Stock and dates
            </legend>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Stock on hand (doses)"
                error={errors.stock}
                htmlFor="medicine-stock"
              >
                <Input
                  id="medicine-stock"
                  type="number"
                  min={0}
                  step={1}
                  placeholder="30"
                  value={values.stock}
                  aria-invalid={Boolean(errors.stock)}
                  aria-describedby={
                    errors.stock ? "medicine-stock-error" : undefined
                  }
                  onChange={(event) => setField("stock", event.target.value)}
                />
              </Field>

              <Field
                label="Expiration date"
                error={errors.expirationDate}
                htmlFor="medicine-expiration"
              >
                <Input
                  id="medicine-expiration"
                  type="date"
                  value={values.expirationDate}
                  aria-invalid={Boolean(errors.expirationDate)}
                  aria-describedby={
                    errors.expirationDate ? "medicine-expiration-error" : undefined
                  }
                  onChange={(event) =>
                    setField("expirationDate", event.target.value)
                  }
                />
              </Field>

              <Field
                label="Treatment end date (optional)"
                error={errors.treatmentEndDate}
                htmlFor="medicine-treatment-end"
              >
                <Input
                  id="medicine-treatment-end"
                  type="date"
                  value={values.treatmentEndDate}
                  aria-invalid={Boolean(errors.treatmentEndDate)}
                  onChange={(event) =>
                    setField("treatmentEndDate", event.target.value)
                  }
                />
              </Field>

              <div className="flex flex-col justify-end">
                <div
                  className="flex flex-col gap-1.5 rounded-xl border border-border/80 bg-card px-3 py-2.5"
                  aria-live="polite"
                >
                  <span className="text-xs text-muted-foreground">
                    Projected supply
                  </span>
                  <Badge variant={supplyBadgeVariant(previewSupply.level)}>
                    {previewSupply.label}
                  </Badge>
                </div>
              </div>
            </div>
          </fieldset>

          {error ? (
            <p
              role="alert"
              className="rounded-xl border border-brick/25 bg-brick-soft/60 px-3 py-2 text-sm text-brick-ink"
            >
              {error}
            </p>
          ) : null}

          <div className="flex flex-col-reverse gap-2 border-t border-border/60 pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" asChild>
              <Link href="/medicines">Cancel</Link>
            </Button>
            <Button type="submit" disabled={isPending}>
              {medicine ? (
                <Save aria-hidden="true" className="size-4" />
              ) : (
                <Plus aria-hidden="true" className="size-4" />
              )}
              {isPending
                ? "Saving…"
                : medicine
                  ? "Save changes"
                  : "Add to cabinet"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function Field({
  label,
  error,
  htmlFor,
  className,
  children,
}: {
  label: string
  error?: string
  htmlFor?: string
  className?: string
  children: React.ReactNode
}) {
  const generatedId = useId()
  const id = htmlFor ?? generatedId
  const errorId = `${id}-error`

  return (
    <div className={className}>
      <Label htmlFor={id} className="mb-1.5">
        {label}
      </Label>
      {children}
      {error ? (
        <p id={errorId} className="mt-1 text-xs text-brick-ink">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function ScheduleModeInfo() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="shrink-0 text-muted-foreground"
          aria-label="How schedule options work"
        >
          <Info aria-hidden="true" className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 text-xs" align="end">
        <div className="space-y-2.5">
          <h4 className="border-b border-border/60 pb-1 font-display text-sm font-medium">
            Schedule options
          </h4>
          <div>
            <p className="font-medium text-foreground">Waking hours (default)</p>
            <p className="text-muted-foreground">
              Spreads daily doses evenly between the first dose and 10:00 PM,
              avoiding overnight alarms.
            </p>
          </div>
          <div>
            <p className="font-medium text-foreground">Strict every N hours</p>
            <p className="text-muted-foreground">
              Divides 24 hours by frequency — ideal for round-the-clock
              antibiotics.
            </p>
          </div>
          <div>
            <p className="font-medium text-foreground">Custom times</p>
            <p className="text-muted-foreground">
              Gives you exact control for every dose in the day.
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
