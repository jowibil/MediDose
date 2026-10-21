// src/features/ScheduleView.tsx
import { useMemo, useState } from "react";
import { CalendarClock, Check, Clock, User, Calendar, PackageX } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptySection } from "@/features/EmptySection";
import type { Medicine, ScheduledDose } from "@/types/medicine";
import { formatTime12h } from "@/lib/schedule";
import { today, toISODate} from "@/lib/dates";

interface ScheduleViewProps {
  medicines: Medicine[];
  doses: ScheduledDose[];
  onToggleDose: (doseId: string) => void;
}

function computeVisibleDoseIds(
  medicines: Medicine[],
  doses: ScheduledDose[],
): Set<string> {
  const visible = new Set<string>();
  const dosesByMedicine = new Map<string, ScheduledDose[]>();

  for (const dose of doses) {
    const list = dosesByMedicine.get(dose.medicineId);
    if (list) {
      list.push(dose);
    } else {
      dosesByMedicine.set(dose.medicineId, [dose]);
    }
  }

  for (const medicine of medicines) {
    const medicineDoses = (dosesByMedicine.get(medicine.id) ?? [])
      .slice()
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

    let remainingStock = medicine.stock;
    for (const dose of medicineDoses) {
      if (dose.taken) {
        visible.add(dose.id);
        continue;
      }
      if (remainingStock > 0) {
        visible.add(dose.id);
        remainingStock -= 1;
      }
    }
  }

  return visible;
}

export function ScheduleView({
  medicines,
  doses,
  onToggleDose,
}: ScheduleViewProps) {
  const [selectedPatient, setSelectedPatient] = useState<string>("all");
  const todayIso = toISODate(today());

  const medicineById = useMemo(
    () => new Map(medicines.map((m) => [m.id, m])),
    [medicines],
  );

  const visibleDoseIds = useMemo(
    () => computeVisibleDoseIds(medicines, doses),
    [medicines, doses],
  );

  // Extract unique patient names for filter tabs
  const patients = useMemo(() => {
    const set = new Set(medicines.map((m) => m.patientName));
    return Array.from(set);
  }, [medicines]);

  // Group today's doses by time slot
  const todayTimeGroups = useMemo(() => {
    const timeMap = new Map<string, ScheduledDose[]>();

    const filteredDoses = doses.filter((d) => {
      if (d.date !== todayIso || !visibleDoseIds.has(d.id)) return false;
      if (selectedPatient === "all") return true;
      const med = medicineById.get(d.medicineId);
      return med?.patientName === selectedPatient;
    });

    for (const dose of filteredDoses) {
      const group = timeMap.get(dose.time);
      if (group) {
        group.push(dose);
      } else {
        timeMap.set(dose.time, [dose]);
      }
    }

    // Sort time slots chronologically
    return Array.from(timeMap.entries()).sort(([timeA], [timeB]) =>
      timeA.localeCompare(timeB),
    );
  }, [doses, todayIso, visibleDoseIds, selectedPatient, medicineById]);

  if (medicines.length === 0) {
    return (
      <EmptySection
        icon={CalendarClock}
        title="Nothing scheduled yet"
        description="Add a medicine and its intake times will be generated automatically."
      />
    );
  }

  // Generate 7-day timeline data for the selected patient
  const patientTimeline = useMemo(() => {
    if (selectedPatient === "all") return null;

    const baseToday = today();
    const days = [];

    // Map the next 7 days starting from today using standard JavaScript Date math
    for (let i = 0; i < 7; i++) {
      const date = new Date(baseToday);
      date.setDate(baseToday.getDate() + i);
      const isoDate = toISODate(date);

      // Doses belonging to this patient on this specific day
      const dayDoses = doses.filter((d) => {
        if (d.date !== isoDate) return false;
        const med = medicineById.get(d.medicineId);
        return med?.patientName === selectedPatient;
      });

      const total = dayDoses.length;
      const takenCount = dayDoses.filter((d) => d.taken).length;

      days.push({
        date,
        isoDate,
        dayLabel: date.toLocaleDateString("en-US", { weekday: "short" }),
        dateLabel: date.getDate(),
        total,
        takenCount,
        isComplete: total > 0 && takenCount === total,
      });
    }

    return days;
  }, [selectedPatient, doses, medicineById]);

  // Identify medicines with 0 stock scheduled for today (filtered by selected patient)
  const zeroStockMedicines = useMemo(() => {
    return medicines.filter((m) => {
      if (m.stock > 0) return false;
      if (selectedPatient !== "all" && m.patientName !== selectedPatient) return false;
      
      // Check if this medicine has any doses scheduled for today
      return doses.some((d) => d.medicineId === m.id && d.date === todayIso);
    });
  }, [medicines, doses, todayIso, selectedPatient]);

  return (
    <div className="flex flex-col gap-6">
      {/* 7-DAY TIMELINE CARD: Rendered ONLY when a specific patient is selected */}
      {selectedPatient !== "all" && patientTimeline && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Calendar className="size-5 text-primary" />
              <CardTitle className="text-base font-semibold">
                7-Day Timeline for {selectedPatient}
              </CardTitle>
            </div>
            <CardDescription>
              Overview of scheduled intakes and completion status for the next 7 days.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-7">
              {patientTimeline.map((day) => {
                const isToday = day.isoDate === todayIso;

                return (
                  <div
                    key={day.isoDate}
                    className={`flex flex-col items-center justify-between gap-1.5 rounded-xl border p-2.5 text-center transition-all ${
                      isToday
                        ? "border-primary bg-background shadow-xs"
                        : "border-border/60 bg-background/60"
                    }`}
                  >
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                        {day.dayLabel}
                      </span>
                      <span className="text-sm font-bold">{day.dateLabel}</span>
                    </div>

                    <div className="w-full">
                      {day.total === 0 ? (
                        <span className="text-[10px] text-muted-foreground">
                          No Doses
                        </span>
                      ) : day.isComplete ? (
                        <Badge variant="safe" className="w-full justify-center text-[10px] py-0.5">
                          <Check className="mr-0.5 size-3" /> Done
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="w-full justify-center text-[10px] py-0.5 font-normal">
                          {day.takenCount}/{day.total} Taken
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Today's Dosage Clusters</CardTitle>
            <CardDescription>
              Medicines grouped by schedule time slot for effortless tracking.
            </CardDescription>
          </div>

          {/* Patient Filter Pills */}
          {patients.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              <Button
                size="sm"
                variant={selectedPatient === "all" ? "default" : "outline"}
                onClick={() => setSelectedPatient("all")}
                className="rounded-full px-3 text-xs"
              >
                All Patients
              </Button>
              {patients.map((patient) => (
                <Button
                  key={patient}
                  size="sm"
                  variant={selectedPatient === patient ? "default" : "outline"}
                  onClick={() => setSelectedPatient(patient)}
                  className="rounded-full px-3 text-xs"
                >
                  <User className="size-3" /> {patient}
                </Button>
              ))}
            </div>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          {/* ZERO STOCK NOTIFICATION BANNER */}
          {zeroStockMedicines.length > 0 && (
            <div className="flex flex-col gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3.5 text-xs text-destructive">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <PackageX className="size-4 shrink-0 text-destructive" />
                Dose Logging Blocked (Out of Stock)
              </div>
              <p className="text-muted-foreground">
                The following {zeroStockMedicines.length === 1 ? "medicine has" : "medicines have"} doses scheduled for today but cannot be logged because stock is 0:
              </p>
              <ul className="list-disc list-inside font-medium text-foreground pl-1">
                {zeroStockMedicines.map((m) => (
                  <li key={m.id}>
                    {m.name} <span className="text-muted-foreground">({m.patientName} — {m.dosageAmount}{m.dosageUnit})</span>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-muted-foreground pt-1">
                Go to the <span className="font-semibold text-foreground">Inventory Ledger</span> tab to restock.
              </p>
            </div>
          )}

          {/* TODAY'S DOSES GRID */}
          {todayTimeGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active doses scheduled for today.
            </p>
          ) : (
            <div className="grid gap-4">
              {todayTimeGroups.map(([time, slotDoses]) => {
                const allTaken = slotDoses.every((d) => d.taken);

                return (
                  <div
                    key={time}
                    className={`flex flex-col gap-3 rounded-2xl border p-4 transition-colors ${
                      allTaken
                        ? "border-border/40 bg-muted/30"
                        : "border-border/80 bg-card shadow-sm"
                    }`}
                  >
                    {/* Time Header */}
                    <div className="flex items-center justify-between border-b border-border/50 pb-2">
                      <div className="flex items-center gap-2 font-display text-base font-semibold">
                        <Clock className="size-4 text-amber" />
                        <span>{formatTime12h(time)}</span>
                        <Badge
                          variant={allTaken ? "safe" : "outline"}
                          className="ml-2 text-[10px]"
                        >
                          {slotDoses.filter((d) => d.taken).length} / {slotDoses.length} Taken
                        </Badge>
                      </div>
                    </div>

                    {/* Grouped Medicine Items */}
                    <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                      {slotDoses.map((dose) => {
                        const medicine = medicineById.get(dose.medicineId);
                        if (!medicine) return null;
                        const blocked = !dose.taken && medicine.stock <= 0;

                        return (
                          <div
                            key={dose.id}
                            className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm transition-all ${
                              dose.taken
                                ? "border-transparent bg-sage-soft/40 text-sage"
                                : "border-border/60 bg-background"
                            }`}
                          >
                            <div className="flex flex-col truncate">
                              <span className="font-medium truncate">
                                {medicine.name}
                              </span>
                              <span className="text-[11px] text-muted-foreground">
                                {medicine.dosageAmount}
                                {medicine.dosageUnit} · {medicine.patientName}
                              </span>
                            </div>

                            <Button
                              size="sm"
                              variant={dose.taken ? "secondary" : "default"}
                              disabled={blocked}
                              onClick={() => onToggleDose(dose.id)}
                              className="h-8 shrink-0 px-2.5 text-xs"
                            >
                              {dose.taken ? (
                                <Check className="size-3.5" />
                              ) : (
                                "Take"
                              )}
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}