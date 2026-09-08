import { useState } from "react";
import {
  AlertTriangle,
  ClipboardList,
  PackageX,
  Plus,
  Minus,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptySection } from "@/features/EmptySection";
import type { Medicine } from "@/types/medicine";
import { isLowStock, isOutOfStock } from "@/lib/inventory";
import { DeleteMedicineDialog } from "@/components/modals/disposeModal";

interface InventoryLedgerProps {
  medicines: Medicine[];
  onRestock: (medicineId: string, additionalStock: number) => void;
  onDelete: (medicineId: string) => void;
}

const DEFAULT_RESTOCK_AMOUNT = "10";

/** Compact quick-adjust steppers that allow immediate stock increment/decrement or custom addition. */
/** Compact quick-adjust steppers that allow immediate stock increment/decrement,
 * or lock entirely when disabled (e.g., low/out of stock).
 */
function QuickStockAdjuster({
  stock,
  disabled = false,
  onUpdateStock,
}: {
  stock: number;
  disabled?: boolean;
  onUpdateStock: (delta: number) => void;
}) {
  return (
    <div
      className={`flex items-center gap-1 rounded-lg border border-border/60 p-0.5 transition-opacity ${
        disabled ? "opacity-50 cursor-not-allowed bg-muted/10" : "bg-muted/30"
      }`}
    >
      <Button
        size="icon"
        variant="ghost"
        className="size-7 text-muted-foreground hover:text-foreground"
        disabled={disabled || stock <= 0}
        onClick={() => onUpdateStock(-1)}
        title={
          disabled ? "Restock from notification banner" : "Decrease stock by 1"
        }
      >
        <Minus className="size-3.5" />
      </Button>

      <span className="min-w-8 text-center text-xs font-semibold tabular-nums">
        {stock}
      </span>

      <Button
        size="icon"
        variant="ghost"
        className="size-7 text-muted-foreground hover:text-foreground"
        disabled={disabled}
        onClick={() => onUpdateStock(1)}
        title={
          disabled ? "Restock from notification banner" : "Increase stock by 1"
        }
      >
        <Plus className="size-3.5" />
      </Button>
    </div>
  );
}

/** Focused restock input strictly used inside the urgent attention banner with error handling for invalid amounts. */
function BannerRestockControl({
  onRestock,
}: {
  onRestock: (amount: number) => void;
}) {
  const [amount, setAmount] = useState(DEFAULT_RESTOCK_AMOUNT);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const parsed = Number(amount);

    // Error handling: check if input is non-numeric, 0, or negative
    if (!amount || isNaN(parsed) || parsed <= 0) {
      setError("Enter an amount greater than 0");
      return;
    }

    // Clear error and trigger restock if valid
    setError(null);
    onRestock(Math.round(parsed));
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setAmount(e.target.value);
    // Clear error message when user starts typing again
    if (error) setError(null);
  }

  return (
    <div className="flex flex-col gap-1 shrink-0">
      <div className="flex items-center gap-1.5">
        <Input
          type="number"
          min={1}
          step={1}
          value={amount}
          aria-label="Restock quantity"
          onChange={handleChange}
          className={`h-8 w-20 px-2 text-xs bg-background ${
            error ? "border-destructive focus-visible:ring-destructive" : ""
          }`}
        />
        <Button
          size="sm"
          variant="default"
          onClick={submit}
          className="h-8 text-xs"
        >
          <Plus className="size-3" /> Add Stock
        </Button>
      </div>

      {/* Error message text */}
      {error && (
        <span className="text-[11px] font-medium text-destructive">
          {error}
        </span>
      )}
    </div>
  );
}

function StockBadge({ medicine }: { medicine: Medicine }) {
  if (isOutOfStock(medicine)) {
    return (
      <Badge variant="expired">
        <PackageX className="size-3" /> Out of stock
      </Badge>
    );
  }

  if (isLowStock(medicine)) return <Badge variant="expiring">Low stock</Badge>;

  return <Badge variant="safe">In stock</Badge>;
}

export function InventoryLedger({
  medicines,
  onRestock,
  onDelete,
}: InventoryLedgerProps) {
  if (medicines.length === 0) {
    return (
      <EmptySection
        icon={ClipboardList}
        title="The ledger is empty"
        description="Stock counts will appear here and decrement automatically as doses are marked taken."
      />
    );
  }

  const restockNeeded = medicines.filter(
    (m) => isLowStock(m) || isOutOfStock(m),
  );

  return (
    <div className="flex flex-col gap-6">
      {/* RESTOCK NEEDED BANNER: Keeps dedicated restock form controls */}
      {restockNeeded.length > 0 ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber/60 bg-amber-soft px-4 py-3 shadow-xs">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            <AlertTriangle className="size-4 text-amber shrink-0" /> Restock
            needed
          </div>
          <ul className="flex flex-col gap-2.5 divide-y divide-amber/20">
            {restockNeeded.map((m) => (
              <li
                key={m.id}
                className="flex flex-col gap-2 text-sm text-ink-soft pt-2 first:pt-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
              >
                <div>
                  <span className="font-medium text-ink">{m.name}</span>{" "}
                  <span className="text-xs text-muted-foreground">
                    ({m.patientName})
                  </span>{" "}
                  —{" "}
                  <span className="font-semibold text-amber-700 dark:text-amber-400">
                    {m.stock === 0
                      ? "out of stock"
                      : `${m.stock} dose${m.stock === 1 ? "" : "s"} remaining`}
                  </span>
                </div>
                <BannerRestockControl
                  onRestock={(amount) => onRestock(m.id, amount)}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Inventory ledger</CardTitle>
          <CardDescription>
            Live stock counts across the cabinet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Mobile Card View */}
          <ul className="flex flex-col gap-3 md:hidden">
            {medicines.map((m) => {
              const requiresRestockBanner = isLowStock(m) || isOutOfStock(m);

              return (
                <li
                  key={m.id}
                  className="flex flex-col gap-3 rounded-2xl border border-border/50 p-4 bg-card"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{m.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {m.patientName} · {m.dosageAmount}
                        {m.dosageUnit} · {m.frequencyPerDay}x/day
                      </p>
                    </div>
                    <StockBadge medicine={m} />
                  </div>
                  <div className="flex items-center justify-between gap-3 pt-2 border-t border-border/40">
                    <span className="text-xs text-muted-foreground">
                      {requiresRestockBanner
                        ? "Restock via banner above"
                        : "Quantity Adjuster"}
                    </span>
                    <div className="flex items-center gap-2">
                      <QuickStockAdjuster
                        stock={m.stock}
                        disabled={requiresRestockBanner}
                        onUpdateStock={(delta) => onRestock(m.id, delta)}
                      />
                      <DeleteMedicineDialog
                        medicineName={m.name}
                        onConfirm={() => onDelete(m.id)}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Desktop Table View */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              {/* ... <thead> stays unchanged ... */}
              <tbody>
                {medicines.map((m) => {
                  const requiresRestockBanner =
                    isLowStock(m) || isOutOfStock(m);

                  return (
                    <tr
                      key={m.id}
                      className="hover:bg-muted/20 transition-colors"
                    >
                      <td className="border-b border-border/60 py-3 pr-4 font-medium">
                        {m.name}
                      </td>
                      <td className="border-b border-border/60 px-2 py-3 text-muted-foreground">
                        {m.patientName}
                      </td>
                      <td className="border-b border-border/60 px-2 py-3 text-muted-foreground">
                        {m.dosageAmount}
                        {m.dosageUnit} · {m.frequencyPerDay}x/day
                      </td>
                      <td className="border-b border-border/60 px-2 py-3">
                        <div className="flex justify-center">
                          <QuickStockAdjuster
                            stock={m.stock}
                            disabled={requiresRestockBanner}
                            onUpdateStock={(delta) => onRestock(m.id, delta)}
                          />
                        </div>
                      </td>
                      <td className="border-b border-border/60 px-2 py-3 text-right">
                        <StockBadge medicine={m} />
                      </td>
                      <td className="border-b border-border/60 px-2 py-3 text-right">
                        <DeleteMedicineDialog
                          medicineName={m.name}
                          onConfirm={() => onDelete(m.id)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
