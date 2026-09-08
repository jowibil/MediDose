import { useState } from "react";
import { Plus, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Medicine, ScheduleMode } from "@/types/medicine";
import { EXPIRING_SOON_THRESHOLD_DAYS } from "@/types/medicine";
import { daysUntil, formatDaysRemaining } from "@/lib/dates";
import {
  hasErrors,
  validateMedicineForm,
  type MedicineFormErrors,
  type MedicineFormValues,
} from "@/lib/validation";
import { DeleteMedicineDialog } from "@/components/modals/disposeModal";

const emptyForm: MedicineFormValues = {
  name: "",
  dosageAmount: "",
  dosageUnit: "mg",
  stock: "",
  expirationDate: "",
  frequencyPerDay: "1",
  patientName: "",
  firstDoseTime: "08:00",
  treatmentEndDate: "",
  scheduleMode: "waking_hours",
  customTimes: ["08:00"],
};

interface AddMedicineFormProps {
  onAdd: (medicine: Medicine) => void;
}

export function AddMedicineForm({ onAdd }: AddMedicineFormProps) {
  const [values, setValues] = useState<MedicineFormValues>(emptyForm);
  const [errors, setErrors] = useState<MedicineFormErrors>({});

  function setField<K extends keyof MedicineFormValues>(
    key: K,
    value: MedicineFormValues[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleFrequencyChange(newFreqStr: string) {
    const newFreq = Number(newFreqStr);
    setField("frequencyPerDay", newFreqStr);

    if (values.scheduleMode === "custom") {
      const currentTimes = [...values.customTimes];
      if (currentTimes.length < newFreq) {
        while (currentTimes.length < newFreq) {
          currentTimes.push("12:00");
        }
      } else if (currentTimes.length > newFreq) {
        currentTimes.splice(newFreq);
      }
      setField("customTimes", currentTimes);
    }
  }

  function handleModeChange(newMode: ScheduleMode) {
    setField("scheduleMode", newMode);
    if (newMode === "custom") {
      const freq = Number(values.frequencyPerDay) || 1;
      const initialTimes = Array.from({ length: freq }, (_, i) => {
        return values.customTimes[i] || values.firstDoseTime || "08:00";
      });
      setField("customTimes", initialTimes);
    }
  }

  function updateCustomTime(index: number, newTime: string) {
    const nextTimes = [...values.customTimes];
    nextTimes[index] = newTime;
    setField("customTimes", nextTimes);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nextErrors = validateMedicineForm(values);
    setErrors(nextErrors);
    if (hasErrors(nextErrors)) return;

    const medicine: Medicine = {
      id: crypto.randomUUID(),
      name: values.name.trim(),
      dosageAmount: Number(values.dosageAmount),
      dosageUnit: values.dosageUnit,
      stock: Number(values.stock),
      expirationDate: values.expirationDate,
      frequencyPerDay: Number(values.frequencyPerDay),
      patientName: values.patientName.trim(),
      firstDoseTime: values.firstDoseTime || "08:00",
      treatmentEndDate: values.treatmentEndDate || undefined,
      scheduleMode: values.scheduleMode,
      customTimes: values.scheduleMode === "custom" ? values.customTimes : undefined,
    };

    onAdd(medicine);
    setValues(emptyForm);
    setErrors({});
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a medicine</CardTitle>
        <CardDescription>
          Add an item to the cabinet to start tracking its schedule, stock, and
          shelf life.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={handleSubmit}
          noValidate
        >
          <Field
            label="Medicine name"
            error={errors.name}
            className="sm:col-span-2"
          >
            <Input
              placeholder="e.g. Amoxicillin"
              value={values.name}
              aria-invalid={!!errors.name}
              onChange={(e) => setField("name", e.target.value)}
            />
          </Field>

          <Field label="Patient" error={errors.patientName}>
            <Input
              placeholder="Who is this for?"
              value={values.patientName}
              aria-invalid={!!errors.patientName}
              onChange={(e) => setField("patientName", e.target.value)}
            />
          </Field>

          <Field label="Frequency (times/day)" error={errors.frequencyPerDay}>
            <Select
              value={values.frequencyPerDay}
              onValueChange={handleFrequencyChange}
            >
              <SelectTrigger aria-invalid={!!errors.frequencyPerDay}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}x per day
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className="sm:col-span-2">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Label>Schedule Option</Label>
              <ScheduleModeTooltip />
            </div>
            <Select
              value={values.scheduleMode}
              onValueChange={(v) => handleModeChange(v as ScheduleMode)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="waking_hours"><strong>Waking Hours:</strong> (Default)</SelectItem>
                <SelectItem value="strict_interval"><strong>Strict:</strong> Every N Hours</SelectItem>
                <SelectItem value="custom"><strong>Custom:</strong> Specific Times</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              {values.scheduleMode === "waking_hours" &&
                "Spreads doses evenly between your first dose and 10:00 PM."}
              {values.scheduleMode === "strict_interval" &&
                "Calculates exact 24-hour intervals (e.g., 4x/day = every 6 hours)."}
              {values.scheduleMode === "custom" &&
                "Allows you to set exact clock times for every dose."}
            </p>
          </div>

          {values.scheduleMode !== "custom" ? (
            <Field label="First dose time" error={errors.firstDoseTime}>
              <Input
                type="time"
                value={values.firstDoseTime}
                aria-invalid={!!errors.firstDoseTime}
                onChange={(e) => setField("firstDoseTime", e.target.value)}
              />
            </Field>
          ) : (
            <Field
              label="Custom Dose Times"
              error={errors.customTimes}
              className="sm:col-span-2"
            >
              <div className="grid gap-2 sm:grid-cols-3">
                {Array.from({ length: Number(values.frequencyPerDay) || 1 }).map(
                  (_, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        Dose {idx + 1}:
                      </span>
                      <Input
                        type="time"
                        value={values.customTimes[idx] || "08:00"}
                        onChange={(e) => updateCustomTime(idx, e.target.value)}
                      />
                    </div>
                  )
                )}
              </div>
            </Field>
          )}

          <Field label="Dosage" error={errors.dosageAmount}>
            <div className="flex gap-2">
              <Input
                type="number"
                min={0}
                step="any"
                placeholder="500"
                value={values.dosageAmount}
                aria-invalid={!!errors.dosageAmount}
                onChange={(e) => setField("dosageAmount", e.target.value)}
              />
              <Select
                value={values.dosageUnit}
                onValueChange={(v) => setField("dosageUnit", v as "mg" | "ml")}
              >
                <SelectTrigger className="w-20 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mg">mg</SelectItem>
                  <SelectItem value="ml">ml</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </Field>

          <Field label="Stock on hand (doses)" error={errors.stock}>
            <Input
              type="number"
              min={0}
              step={1}
              placeholder="30"
              value={values.stock}
              aria-invalid={!!errors.stock}
              onChange={(e) => setField("stock", e.target.value)}
            />
          </Field>

          <Field label="Expiration date ( Of Medicine )" error={errors.expirationDate}>
            <Input
              type="date"
              value={values.expirationDate}
              aria-invalid={!!errors.expirationDate}
              onChange={(e) => setField("expirationDate", e.target.value)}
            />
          </Field>

          <Field label="Treatment end date ( Optional )" error={errors.treatmentEndDate}>
            <Input
              type="date"
              value={values.treatmentEndDate}
              aria-invalid={!!errors.treatmentEndDate}
              onChange={(e) => setField("treatmentEndDate", e.target.value)}
            />
          </Field>

          <div className="flex justify-end sm:col-span-2">
            <Button type="submit">
              <Plus /> Add to cabinet
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function ScheduleModeTooltip() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center text-muted-foreground hover:text-foreground focus:outline-none"
          aria-label="Schedule options info"
        >
          <Info className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 text-xs" align="start">
        <div className="space-y-2.5">
          <h4 className="font-semibold text-sm border-b pb-1">
            Schedule Modes Explained
          </h4>

          <div>
            <p className="font-medium text-foreground">1. Waking Hours (Default)</p>
            <p className="text-muted-foreground">
              Spreads all daily doses evenly between your first dose and 10:00 PM.
              Prevents scheduling doses while sleeping (e.g., 3:00 AM).
            </p>
          </div>

          <div>
            <p className="font-medium text-foreground">2. Strict Every N Hours</p>
            <p className="text-muted-foreground">
              Divides 24 hours strictly by frequency (e.g., 4x/day = every 6 hours).
              Ideal for antibiotics requiring round-the-clock timing.
            </p>
          </div>

          <div>
            <p className="font-medium text-foreground">3. Custom Specific Times</p>
            <p className="text-muted-foreground">
              Gives you complete control to set exact intake times for each dose
              (e.g., 8:00 AM, 1:00 PM, 7:00 PM).
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Field({
  label,
  error,
  className,
  children,
}: {
  label: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label className="mb-1.5">{label}</Label>
      {children}
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function expirationBadgeVariant(iso: string) {
  const days = daysUntil(iso);
  if (days < 0) return "expired" as const;
  if (days <= EXPIRING_SOON_THRESHOLD_DAYS) return "expiring" as const;
  return "safe" as const;
}

interface CabinetListProps {
  medicines: Medicine[];
  onDelete: (medicineId: string) => void;
}

export function CabinetList({ medicines, onDelete }: CabinetListProps) {
  if (medicines.length === 0) return null;

  return (
    <div>
      <h2 className="mb-2 font-display text-sm tracking-tight text-muted-foreground">
        In the cabinet ({medicines.length})
      </h2>
      <ul className="divide-y divide-border/60 rounded-2xl border border-border/50 bg-card">
        {medicines.map((m) => (
          <li
            key={m.id}
            className="flex items-center justify-between gap-4 px-4 py-3"
          >
            <div>
              <p className="text-sm font-medium">{m.name}</p>
              <p className="text-xs text-muted-foreground">
                {m.patientName} · {m.dosageAmount}
                {m.dosageUnit} · {m.frequencyPerDay}x/day · {m.stock} in stock
                {m.treatmentEndDate ? `· Until ${m.treatmentEndDate}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={expirationBadgeVariant(m.expirationDate)}>
                {formatDaysRemaining(m.expirationDate)}
              </Badge>
              <DeleteMedicineDialog
                medicineName={m.name}
                onConfirm={() => onDelete(m.id)}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}