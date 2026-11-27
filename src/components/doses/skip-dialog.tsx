"use client"

import { useState } from "react"
import { Check } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  MAX_SKIP_NOTE_LENGTH,
  SKIP_REASON_OPTIONS,
  type SkipReason,
} from "@/types/medicine"
import { cn } from "@/lib/utils"

export function SkipDialog({
  open,
  onOpenChange,
  initialReason,
  initialNote,
  pending,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialReason?: SkipReason | null
  initialNote?: string | null
  pending: boolean
  onConfirm: (reason: SkipReason, note: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* DialogContent unmounts when closed, so the form re-initializes
            from the current occurrence each time it opens. */}
        <SkipForm
          initialReason={initialReason ?? null}
          initialNote={initialNote ?? ""}
          pending={pending}
          onCancel={() => onOpenChange(false)}
          onConfirm={onConfirm}
        />
      </DialogContent>
    </Dialog>
  )
}

function SkipForm({
  initialReason,
  initialNote,
  pending,
  onCancel,
  onConfirm,
}: {
  initialReason: SkipReason | null
  initialNote: string
  pending: boolean
  onCancel: () => void
  onConfirm: (reason: SkipReason, note: string) => void
}) {
  const [reason, setReason] = useState<SkipReason | null>(initialReason)
  const [note, setNote] = useState(initialNote)

  return (
    <>
      <DialogHeader>
        <DialogTitle>Why was this dose skipped?</DialogTitle>
        <DialogDescription>
          Pick one reason. The dose stays in your history.
        </DialogDescription>
      </DialogHeader>

      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (reason) onConfirm(reason, note)
        }}
      >
        <div
          role="radiogroup"
          aria-label="Skip reason"
          className="grid gap-2 sm:grid-cols-2"
        >
          {SKIP_REASON_OPTIONS.map((option) => {
            const selected = reason === option.value
            return (
              <label
                key={option.value}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors",
                  "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-card",
                  selected
                    ? "border-sage bg-sage-soft/50 font-medium"
                    : "border-border hover:bg-muted/60",
                )}
              >
                <span>{option.label}</span>
                <input
                  type="radio"
                  name="skip-reason"
                  value={option.value}
                  checked={selected}
                  onChange={() => setReason(option.value)}
                  className="sr-only"
                />
                {selected ? (
                  <Check aria-hidden="true" className="size-4 text-sage-ink" />
                ) : null}
              </label>
            )
          })}
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <Label htmlFor="skip-note">Add a note (optional)</Label>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {note.length}/{MAX_SKIP_NOTE_LENGTH}
            </span>
          </div>
          <Textarea
            id="skip-note"
            value={note}
            maxLength={MAX_SKIP_NOTE_LENGTH}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Anything the household should know?"
          />
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={!reason || pending}>
            {pending ? "Saving…" : "Mark as skipped"}
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}
