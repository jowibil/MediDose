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
}

/** One array per section, so callers index by tag instead of re-deriving it. */
export type PharmacyList = Record<PharmacyTag, PharmacyRow[]>

const ACTIONS: Record<PharmacyTag, string> = {
  restock: "Buy more",
  expiring: "Ask about a refill before it expires",
  expired: "Return for disposal",
}

/**
 * One row per medicine, under the most urgent heading, carrying every tag.
 *
 * Urgency follows the order of the sections on the page: a medicine you must
 * buy is the first thing to do on the trip, an expiring one is an "ask about a
 * refill" errand, and an expired one is a disposal task. So an expired medicine
 * that is also out of stock lands under Restock with both tags, which is what
 * you act on, and the Expired tag still tells you to hand the old pack back.
 */
function sectionFor(tags: PharmacyTag[]): PharmacyTag {
  if (tags.includes("restock")) return "restock"
  if (tags.includes("expiring")) return "expiring"
  return "expired"
}

interface Entry {
  row: PharmacyRow
  section: PharmacyTag
  /** Days of supply for Restock, days to expiry otherwise. Null sorts last. */
  sortKey: number | null
}

/** Ascending by `direction = 1`, most recent first by `-1`; unknown sorts last. */
function bySortKey(direction: 1 | -1) {
  return (a: Entry, b: Entry) => {
    if (a.sortKey === null && b.sortKey === null) {
      return a.row.name.localeCompare(b.row.name)
    }
    if (a.sortKey === null) return 1
    if (b.sortKey === null) return -1
    const delta = (a.sortKey - b.sortKey) * direction
    return delta !== 0 ? delta : a.row.name.localeCompare(b.row.name)
  }
}

export function buildPharmacyList(
  medicines: PharmacyMedicine[],
  todayIso: string,
  now: Date = new Date(),
): PharmacyList {
  const entries: Entry[] = []

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
    entries.push({
      section,
      sortKey: section === "restock" ? supply.daysRemaining : remaining,
      row: {
        medicineId: medicine.id,
        patientId: medicine.patientId,
        patientName: medicine.patientName,
        name: medicine.name,
        dosage: `${formatDosage(medicine.dosageAmount, medicine.dosageUnit)} · ${medicine.frequencyPerDay}× daily`,
        detail:
          section === "restock"
            ? supply.shortLabel
            : formatDaysRemaining(medicine.expirationDate, todayIso),
        action: ACTIONS[section],
        tags,
      },
    })
  }

  const pick = (section: PharmacyTag, direction: 1 | -1) =>
    entries
      .filter((entry) => entry.section === section)
      .sort(bySortKey(direction))
      .map((entry) => entry.row)

  return {
    restock: pick("restock", 1),
    expiring: pick("expiring", 1),
    // Most recently expired first: those are the ones still in the cabinet.
    expired: pick("expired", -1),
  }
}

const SECTION_HEADINGS: Record<PharmacyTag, string> = {
  restock: "RESTOCK",
  expiring: "EXPIRING SOON",
  expired: "EXPIRED — RETURN TO THE PHARMACY",
}

/**
 * The copy/print text. Deliberately plain: it is pasted into a note or handed
 * to whoever is going to the pharmacy, not rendered.
 */
export function toPlainText(
  list: PharmacyList,
  householdName: string,
  todayIso: string,
): string {
  const lines = [`MEDIDOSE — PHARMACY LIST · ${todayIso}`, `For: ${householdName}`]

  for (const tag of ["restock", "expiring", "expired"] as const) {
    const rows = list[tag]
    if (rows.length === 0) continue
    lines.push("", SECTION_HEADINGS[tag])
    for (const row of rows) {
      lines.push(
        `- ${row.name} · ${row.patientName} · ${row.detail} · ${row.action}`,
      )
    }
  }

  if (countRows(list) === 0) {
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
