import { describe, expect, it } from "vitest"

import {
  buildPharmacyList,
  countPatients,
  countRows,
  toPlainText,
  type PharmacyMedicine,
} from "@/lib/pharmacy-list"

const TODAY = "2026-11-25"
const NOW = new Date("2026-11-25T08:00:00")

function medicine(overrides: Partial<PharmacyMedicine> = {}): PharmacyMedicine {
  return {
    id: "m1",
    patientId: "p1",
    name: "Amoxicillin",
    dosageAmount: 500,
    dosageUnit: "mg",
    stock: 20,
    expirationDate: "2028-01-01",
    frequencyPerDay: 2,
    scheduleMode: "custom",
    firstDoseTime: "08:00",
    customTimes: ["08:00", "20:00"],
    scheduleTimes: ["08:00", "20:00"],
    treatmentEndDate: null,
    archivedAt: null,
    archivedDate: null,
    createdDate: "2026-11-01",
    createdAt: "2026-11-01T00:00:00Z",
    patientName: "Alex",
    ...overrides,
  }
}

const build = (medicines: PharmacyMedicine[]) =>
  buildPharmacyList(medicines, TODAY, NOW)

describe("buildPharmacyList", () => {
  it("lists an out-of-stock medicine under restock", () => {
    const list = build([medicine({ stock: 0 })])
    expect(list.restock).toHaveLength(1)
    expect(list.restock[0].detail).toBe("Out of stock")
    expect(list.restock[0].action).toBe("Buy more")
    expect(list.restock[0].dosage).toBe("500mg · 2× daily")
  })

  it("lists low supply under restock", () => {
    const list = build([medicine({ stock: 4 })])
    expect(list.restock).toHaveLength(1)
    expect(list.restock[0].detail).toBe("~2 days left")
  })

  it("keeps the legacy stock ≤ 5 threshold", () => {
    const list = build([medicine({ stock: 5, frequencyPerDay: 1 })])
    expect(list.restock).toHaveLength(1)
    expect(list.restock[0].detail).toBe("~5 days left")
  })

  it("leaves a healthy, long-dated medicine off the list", () => {
    const list = build([medicine({ stock: 40 })])
    expect(countRows(list)).toBe(0)
  })

  it("lists 0-30 days to expiry as expiring, 31 days as nothing", () => {
    const list = build([
      medicine({ id: "a", name: "A", expirationDate: "2026-12-07" }),
      medicine({ id: "b", name: "B", expirationDate: "2026-11-25" }),
      medicine({ id: "c", name: "C", expirationDate: "2026-12-26" }),
    ])
    expect(list.expiring.map((row) => row.name)).toEqual(["B", "A"])
    expect(list.expiring[1].detail).toBe("12 days left")
    expect(list.expiring[0].detail).toBe("Expires today")
  })

  it("lists a past expiration date as expired", () => {
    const list = build([medicine({ stock: 40, expirationDate: "2026-11-22" })])
    expect(list.expired).toHaveLength(1)
    expect(list.expired[0].detail).toBe("Expired 3 days ago")
    expect(list.expired[0].action).toBe("Return for disposal")
  })

  it("shows a low and expiring medicine once, under restock, with both tags", () => {
    const list = build([
      medicine({ stock: 2, expirationDate: "2026-12-01" }),
    ])
    expect(countRows(list)).toBe(1)
    expect(list.restock).toHaveLength(1)
    expect(list.expiring).toHaveLength(0)
    expect(list.restock[0].tags).toEqual(["restock", "expiring"])
  })

  it("shows an expired medicine that is out of stock once, under restock", () => {
    const list = build([medicine({ stock: 0, expirationDate: "2025-01-01" })])
    expect(countRows(list)).toBe(1)
    expect(list.restock[0].tags).toContain("expired")
    expect(list.restock[0].tags).toContain("restock")
  })

  it("orders restock by days of supply ascending", () => {
    const list = build([
      medicine({ id: "a", name: "Plenty", stock: 6, frequencyPerDay: 1 }),
      medicine({ id: "b", name: "Empty", stock: 0 }),
      medicine({ id: "c", name: "Nearly", stock: 2, frequencyPerDay: 2 }),
    ])
    expect(list.restock.map((row) => row.name)).toEqual([
      "Empty",
      "Nearly",
      "Plenty",
    ])
  })

  it("orders expired most recently expired first", () => {
    const list = build([
      medicine({ id: "a", name: "Old", stock: 40, expirationDate: "2025-01-01" }),
      medicine({ id: "b", name: "New", stock: 40, expirationDate: "2026-11-24" }),
    ])
    expect(list.expired.map((row) => row.name)).toEqual(["New", "Old"])
  })

  it("keeps each row tied to its patient", () => {
    const list = build([
      medicine({ id: "a", patientId: "p1", patientName: "Alex", stock: 0 }),
      medicine({ id: "b", patientId: "p2", patientName: "Sam", stock: 0 }),
    ])
    expect(list.restock.map((row) => row.patientName)).toEqual(["Alex", "Sam"])
    expect(countPatients(list)).toBe(2)
  })
})

describe("toPlainText", () => {
  it("writes the header, the section headings and one line per row", () => {
    const list = build([
      medicine({ stock: 0, patientName: "Alex" }),
      medicine({
        id: "b",
        name: "Ibuprofen",
        stock: 40,
        expirationDate: "2026-12-05",
        patientName: "Sam",
      }),
    ])
    const text = toPlainText(list, "Rivera household", TODAY)
    expect(text).toBe(
      [
        "MEDIDOSE — PHARMACY LIST · 2026-11-25",
        "For: Rivera household",
        "",
        "RESTOCK",
        "- Amoxicillin · Alex · Out of stock · Buy more",
        "",
        "EXPIRING SOON",
        "- Ibuprofen · Sam · 10 days left · Ask about a refill before it expires",
      ].join("\n"),
    )
  })

  it("omits empty sections", () => {
    const text = toPlainText(build([medicine({ stock: 0 })]), "Rivera", TODAY)
    expect(text).not.toContain("EXPIRING SOON")
    expect(text).not.toContain("EXPIRED")
  })

  it("says so when nothing needs a trip", () => {
    const text = toPlainText(build([medicine()]), "Rivera", TODAY)
    expect(text).toContain("Nothing needs a pharmacy trip right now.")
  })
})
