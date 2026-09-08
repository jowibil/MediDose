import { Trash2, TriangleAlert } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptySection } from "@/features/EmptySection";
import type { ExpirationStatus, Medicine } from "@/types/medicine";
import { EXPIRING_SOON_THRESHOLD_DAYS } from "@/types/medicine";
import { daysUntil, formatDaysRemaining } from "@/lib/dates";
import { DeleteMedicineDialog } from "@/components/modals/disposeModal";

interface ExpirationBoardProps {
  medicines: Medicine[];
  onDispose: (medicineId: string) => void;
  onDelete: (medicineId: string) => void;
}

function statusFor(medicine: Medicine): ExpirationStatus {
  const days = daysUntil(medicine.expirationDate);
  if (days < 0) return "expired";
  if (days <= EXPIRING_SOON_THRESHOLD_DAYS) return "expiring";
  return "safe";
}

const COLUMNS: {
  status: ExpirationStatus;
  title: string;
  description: string;
}[] = [
  {
    status: "safe",
    title: "Safe",
    description: `More than ${EXPIRING_SOON_THRESHOLD_DAYS} days remaining`,
  },
  {
    status: "expiring",
    title: "Expiring soon",
    description: `${EXPIRING_SOON_THRESHOLD_DAYS} days or fewer remaining`,
  },
  {
    status: "expired",
    title: "Expired",
    description: "Past the expiration date — dispose safely",
  },
];

export function ExpirationBoard({
  medicines,
  onDispose,
  onDelete,
}: ExpirationBoardProps) {
  if (medicines.length === 0) {
    return (
      <EmptySection
        icon={TriangleAlert}
        title="Nothing to track yet"
        description="Once medicines are added, they'll be sorted here by shelf life: Safe, Expiring Soon, or Expired."
      />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {COLUMNS.map((col) => {
        const items = medicines.filter((m) => statusFor(m) === col.status);
        return (
          <Card key={col.status} className="flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 tracking-tight">
                <Badge variant={col.status}>{items.length}</Badge>
                {col.title}
              </CardTitle>
              <CardDescription>{col.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-2">
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing here.</p>
              ) : (
                items.map((m) => (
                  <div
                    key={m.id}
                    className="rounded-xl border border-border/50 px-3 py-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{m.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {m.patientName}
                        </p>
                      </div>
                      {col.status !== "expired" ? (
                        <DeleteMedicineDialog
                          medicineName={m.name}
                          iconVariant="muted"
                          onConfirm={() => onDelete(m.id)}
                        />
                      ) : null}
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">
                        {formatDaysRemaining(m.expirationDate)}
                      </span>
                      {col.status === "expired" ? (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => onDispose(m.id)}
                        >
                          <Trash2 /> Dispose
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}