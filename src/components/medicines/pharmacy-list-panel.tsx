"use client"

import { useState } from "react"
import {
  Check,
  ClipboardCopy,
  Printer,
  ShoppingBasket,
  TriangleAlert,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptySection } from "@/components/empty-section"
import {
  countPatients,
  countRows,
  toPlainText,
  type PharmacyList,
  type PharmacyRow,
  type PharmacyTag,
} from "@/lib/pharmacy-list"

const TAG_LABEL: Record<PharmacyTag, string> = {
  restock: "Restock",
  expiring: "Expiring",
  expired: "Expired",
}

/** Both Restock and Expired read as urgent; only Expiring soon is amber. */
function badgeVariant(tag: PharmacyTag) {
  return tag === "expiring" ? "expiring" : "expired"
}

const SECTIONS: {
  tag: PharmacyTag
  title: string
  description: string
  icon: typeof ShoppingBasket
}[] = [
  {
    tag: "restock",
    title: "Restock",
    description: "Out of stock, or running low before the next refill.",
    icon: ShoppingBasket,
  },
  {
    tag: "expiring",
    title: "Expiring soon",
    description: "Thirty days or fewer left on the shelf.",
    icon: TriangleAlert,
  },
  {
    tag: "expired",
    title: "Expired",
    description: "Past the expiration date — hand these back for disposal.",
    icon: TriangleAlert,
  },
]

function PharmacyRowItem({ row }: { row: PharmacyRow }) {
  return (
    <li className="pharmacy-row flex flex-col gap-1.5 border-b border-border/50 py-3 last:border-b-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="font-medium">
          {row.name}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {row.patientName}
          </span>
        </p>
        <p className="text-xs text-muted-foreground">{row.dosage}</p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm">{row.detail}</span>
        <span aria-hidden="true" className="text-muted-foreground">
          ·
        </span>
        <span className="text-sm text-muted-foreground">{row.action}</span>
      </div>
      {row.tags.length > 1 ? (
        <div className="flex flex-wrap gap-1.5">
          {row.tags.map((tag) => (
            <Badge key={tag} variant={badgeVariant(tag)}>
              {TAG_LABEL[tag]}
            </Badge>
          ))}
        </div>
      ) : null}
    </li>
  )
}

export function PharmacyListPanel({
  list,
  householdName,
  todayIso,
}: {
  list: PharmacyList
  householdName: string
  todayIso: string
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  )
  const total = countRows(list)
  const patients = countPatients(list)

  if (total === 0) {
    return (
      <EmptySection
        icon={ShoppingBasket}
        title="Nothing to buy"
        description="No medicine in this household is out of stock, running low, expiring within 30 days, or expired."
      />
    )
  }

  async function copyList() {
    try {
      await navigator.clipboard.writeText(
        toPlainText(list, householdName, todayIso),
      )
      setCopyState("copied")
    } catch {
      // No clipboard permission (or an insecure context): the list is still on
      // screen and printable, so say so rather than pretending it copied.
      setCopyState("failed")
    }
    window.setTimeout(() => setCopyState("idle"), 2500)
  }

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-border/80 bg-card p-5 shadow-card sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-display text-lg leading-tight font-medium">
            Pharmacy list · {householdName}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {total} {total === 1 ? "medicine" : "medicines"} for {patients}{" "}
            {patients === 1 ? "patient" : "patients"} · {todayIso}
          </p>
        </div>
        <div data-print="hide" className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={copyList}>
            {copyState === "copied" ? (
              <Check aria-hidden="true" className="size-4" />
            ) : (
              <ClipboardCopy aria-hidden="true" className="size-4" />
            )}
            {copyState === "copied"
              ? "Copied"
              : copyState === "failed"
                ? "Copy failed"
                : "Copy list"}
          </Button>
          <Button type="button" onClick={() => window.print()}>
            <Printer aria-hidden="true" className="size-4" /> Print
          </Button>
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {copyState === "copied"
          ? "Pharmacy list copied to the clipboard."
          : copyState === "failed"
            ? "Copying failed. The list is on screen and can be printed."
            : ""}
      </p>

      <div className="space-y-4">
        {SECTIONS.map((section) => {
          const rows = list[section.tag]
          if (rows.length === 0) return null
          return (
            <section
              key={section.tag}
              className="pharmacy-section rounded-2xl border border-border/80 bg-card p-5"
            >
              <div className="mb-2 flex items-start gap-3">
                <section.icon
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                />
                <div>
                  <h3 className="flex items-center gap-2 font-display text-base font-medium tracking-tight">
                    {section.title}
                    <Badge variant={badgeVariant(section.tag)}>
                      {rows.length}
                    </Badge>
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {section.description}
                  </p>
                </div>
              </div>
              <ul>
                {rows.map((row) => (
                  <PharmacyRowItem key={row.medicineId} row={row} />
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}
