"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Minus, PackagePlus, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { adjustStockAction, restockAction } from "@/lib/actions/medicines"
import { validateRestockQuantity } from "@/lib/validation"

export function RestockDialog({
  medicineId,
  medicineName,
  stock,
  trigger,
}: {
  medicineId: string
  medicineName: string
  stock: number
  trigger?: React.ReactNode
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState("10")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const quantityError = validateRestockQuantity(amount)
    if (quantityError) {
      setError(quantityError)
      return
    }

    setError(null)
    startTransition(async () => {
      const result = await restockAction(medicineId, amount)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setOpen(false)
      setAmount("10")
      router.refresh()
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setError(null)
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline">
            <PackagePlus className="size-3.5" />
            Restock
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Restock {medicineName}</DialogTitle>
          <DialogDescription>
            Currently {stock} dose{stock === 1 ? "" : "s"} on hand. Add whole
            doses between 1 and 10,000.
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div>
            <Label htmlFor="restock-amount" className="mb-1.5">
              Doses to add
            </Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id="restock-amount"
                type="number"
                min={1}
                max={10000}
                step={1}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="w-28"
                aria-invalid={Boolean(error)}
              />
              {[10, 30].map((quick) => (
                <Button
                  key={quick}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setAmount(String(quick))}
                >
                  +{quick}
                </Button>
              ))}
            </div>
          </div>

          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Restocking…" : "Add stock"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Owner-only ±1 stock edit; every change is audited as `owner_edit`. */
export function StockStepper({
  medicineId,
  stock,
}: {
  medicineId: string
  stock: number
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function adjust(delta: number) {
    setError(null)
    startTransition(async () => {
      const result = await adjustStockAction(medicineId, delta)
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-muted/30 p-0.5">
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          disabled={isPending || stock <= 0}
          onClick={() => adjust(-1)}
          aria-label="Decrease stock by 1"
        >
          <Minus className="size-3.5" />
        </Button>
        <span className="min-w-8 text-center text-xs font-semibold tabular-nums">
          {stock}
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          disabled={isPending}
          onClick={() => adjust(1)}
          aria-label="Increase stock by 1"
        >
          <Plus className="size-3.5" />
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-[11px] text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
