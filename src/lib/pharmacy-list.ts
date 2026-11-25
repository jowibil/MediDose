import { daysUntil, formatDaysRemaining } from "@/lib/dates"
import { formatDosage } from "@/lib/mappers"
import { needsRestock } from "@/lib/inventory"
import { calculateSupply } from "@/lib/supply"
import { EXPIRING_SOON_THRESHOLD_DAYS, type Medicine } from "@/types/medicine"

/** A medicine with the name of the person it belongs to. */
export interface PharmacyMedicine extends Medicine {
  patientName: string
}

export type PharmacyTag = "restock" | "expiring" | "expired"

export interface PharmacyRow {
  medicineId: string
  patientId: string
  patientName: string
  name: string
  /** "500mg · 2× daily" */
  dosage: string
  /** Why it is on the list, in the person's words. */
  detail: string
  /** What to do at the pharmacy. */
  action: string
  /** Every reason this medicine is listed, even when it shows under one heading. */
  tags: PharmacyTag[]
  daysOfSupply: number | null
  daysUntilExpiry: number
  expirationDate: string
}

export interface PharmacyList {
  restock: PharmacyRow[]
  expiring: PharmacyRow[]
  expired: PharmacyRow[]
}

/**
 * One row per medicine, under the most urgent heading, carrying every tag.
 *
 * Urgency follows the order of the sections on the page: a medicine you must
 * buy is the first thing to do on the trip, an expiring one is a "ask about a
 * refill" errand, and an expired one is a disposal task. So an expired medicine
 * that is also out of stock lands under Restock with both tags, which is what
 * you act on, and the Expired tag still tells you to hand the old pack back.
 */
function sectionFor(tags: PharmacyTag[]): PharmacyTag {
  if (tags.includes("restock")) return "restock"
  if (tags.includes("expiring")) return "expiring"
  return "expired"
}

/** Restock: days of supply ascending; expiring: soonest first; expired: newest first. */
function byNumber(
  read: (row: PharmacyRow) => number | null,
  direction: 1 | -1,
) {
  return (a: PharmacyRow, b: PharmacyRow) => {
    const left = read(a)
    const right = read(b)
    // Unknown supply sorts last: it needs a human look, not a shopping trip.
    if (left === null && right === null) return a.name.localeCompare(b.name)
    if (left === null) return 1
    if (right === null) return -1
    const delta = (left - right) * direction
    return delta !== 0 ? delta : a.name.localeCompare(b.name)
  }
}

export function buildPharmacyList(
  medicines: PharmacyMedicine[],
  todayIso: string,
  now: Date = new Date(),
): PharmacyList {
  const rows: PharmacyRow[] = []

  for (const medicine of medicines) {
    const supply = calculateSupply(medicine.stock, medicine.frequencyPerDay, now)
    const remaining = daysUntil(medicine.expirationDate, todayIso)

    const tags: PharmacyTag[] = []
    if (medicine.stock === 0 || needsRestock(medicine, now)) tags.push("restock")
    if (remaining >= 0 && remaining <= EXPIRING_SOON_THRESHOLD_DAYS) {
      tags.push("expiring")
    }
    if (remaining < 0) tags.push("expired")

    if (tags.length === 0) continue

    const section = sectionFor(tags)
    const detail =
      section === "restock"
        ? supply.shortLabel
        : formatDaysRemaining(medicine.expirationDate, todayIso)
    const action =
      section === "restock"
        ? "Buy more"
        : section === "expiring"
          ? "Ask about a refill before it expires"
          : "Return for disposal"

    rows.push({
      medicineId: medicine.id,
      patientId: medicine.patientId,
      patientName: medicine.patientName,
      name: medicine.name,
      dosage: `${formatDosage(medicine.dosageAmount, medicine.dosageUnit)} · ${medicine.frequencyPerDay}× daily`,
      detail,
      action,
      tags,
      daysOfSupply: supply.daysRemaining,
      daysUntilExpiry: remaining,
      expirationDate: medicine.expirationDate,
    })
  }

  const inSection = (section: PharmacyTag) =>
    rows.filter((row) => sectionFor(row.tags) === section)

  const restock = inSection("restock").sort(byNumber((row) => row.daysOfSupply, 1))
  const expiring = inSection("expiring").sort(
    byNumber((row) => row.daysUntilExpiry, 1),
  )
  // Most recently expired first: those are the ones still in the cabinet.
  const expired = inSection("expired").sort(
    byNumber((row) => row.daysUntilExpiry, -1),
  )

  return { restock, expiring, expired }
}

const SECTION_HEADINGS: { tag: PharmacyTag; heading: string }[] = [
  { tag: "restock", heading: "RESTOCK" },
  { tag: "expiring", heading: "EXPIRING SOON" },
  { tag: "expired", heading: "EXPIRED — RETURN TO THE PHARMACY" },
]

/**
 * The copy/print text. Deliberately plain: it is pasted into a note or handed
 * to whoever is going to the pharmacy, not rendered.
 */
export function toPlainText(
  list: PharmacyList,
  householdName: string,
  todayIso: string,
): string {
  const rowsFor = (tag: PharmacyTag) =>
    tag === "restock"
      ? list.restock
      : tag === "expiring"
        ? list.expiring
        : list.expired

  const lines = [`MEDIDOSE — PHARMACY LIST · ${todayIso}`, `For: ${householdName}`]

  for (const { tag, heading } of SECTION_HEADINGS) {
    const rows = rowsFor(tag)
    if (rows.length === 0) continue
    lines.push("", heading)
    for (const row of rows) {
      lines.push(
        `- ${row.name} · ${row.patientName} · ${row.detail} · ${row.action}`,
      )
    }
  }

  if (list.restock.length + list.expiring.length + list.expired.length === 0) {
    lines.push("", "Nothing needs a pharmacy trip right now.")
  }

  return lines.join("\n")
}

export function countRows(list: PharmacyList): number {
  return list.restock.length + list.expiring.length + list.expired.length
}

export function countPatients(list: PharmacyList): number {
  const ids = [...list.restock, ...list.expiring, ...list.expired].map(
    (row) => row.patientId,
  )
  return new Set(ids).size
}
