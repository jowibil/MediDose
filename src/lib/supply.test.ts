import { describe, expect, it } from "vitest"

import { calculateSupply, supplyBadgeVariant } from "@/lib/supply"

// Wednesday, November 25, 2026, 10:00 local time.
const NOW = new Date(2026, 10, 25, 10, 0, 0)

describe("calculateSupply", () => {
  it("reports zero stock as out of stock", () => {
    const supply = calculateSupply(0, 1, NOW)
    expect(supply.daysRemaining).toBe(0)
    expect(supply.level).toBe("out")
    expect(supply.label).toBe("Out of stock")
    expect(supplyBadgeVariant(supply.level)).toBe("expired")
  })

  it("treats zero stock as out regardless of frequency", () => {
    expect(calculateSupply(0, 4, NOW).level).toBe("out")
  })

  it("shows sub-day supply rather than out of stock", () => {
    const supply = calculateSupply(1, 3, NOW)
    expect(supply.daysRemaining).toBe(0)
    expect(supply.level).toBe("critical")
    expect(supply.label).toBe("Less than 1 day left — Restock today")
    expect(supply.shortLabel).toBe("Less than 1 day left")
    expect(supply.restockByLabel).toBe("today")
  })

  it("treats 2 days as critical/red", () => {
    const supply = calculateSupply(2, 1, NOW)
    expect(supply.daysRemaining).toBe(2)
    expect(supply.level).toBe("critical")
    expect(supply.label).toBe("~2 days left — Restock by Friday")
    expect(supplyBadgeVariant(supply.level)).toBe("expired")
  })

  it("uses the brief example: stock 10, frequency 4", () => {
    const supply = calculateSupply(10, 4, NOW)
    expect(supply.daysRemaining).toBe(2)
    expect(supply.label).toBe("~2 days left — Restock by Friday")
  })

  it("covers the 2-day and 3-day boundary", () => {
    expect(calculateSupply(5, 2, NOW).level).toBe("critical")
    expect(calculateSupply(6, 2, NOW).daysRemaining).toBe(3)
    expect(calculateSupply(6, 2, NOW).level).toBe("low")
    expect(calculateSupply(6, 2, NOW).label).toBe(
      "~3 days left — Restock by Saturday",
    )
    expect(supplyBadgeVariant(calculateSupply(6, 2, NOW).level)).toBe("expiring")
  })

  it("covers the 7-day and 8-day boundary (weekday vs date)", () => {
    const seven = calculateSupply(14, 2, NOW)
    expect(seven.daysRemaining).toBe(7)
    expect(seven.level).toBe("low")
    expect(seven.label).toBe("~7 days left — Restock by Dec 2")

    const sevenFloor = calculateSupply(15, 2, NOW)
    expect(sevenFloor.daysRemaining).toBe(7)
    expect(sevenFloor.label).toBe("~7 days left — Restock by Dec 2")

    const eight = calculateSupply(16, 2, NOW)
    expect(eight.daysRemaining).toBe(8)
    expect(eight.level).toBe("healthy")
    expect(eight.label).toBe("~8 days left — Restock by Dec 3")
    expect(supplyBadgeVariant(eight.level)).toBe("outline")
  })

  it("uses a formatted date at 15 days", () => {
    const supply = calculateSupply(30, 2, NOW)
    expect(supply.daysRemaining).toBe(15)
    expect(supply.level).toBe("healthy")
    expect(supply.restockByLabel).toBe("Dec 10")
  })

  it("uses the weekday at 6 days", () => {
    expect(calculateSupply(6, 1, NOW).label).toBe(
      "~6 days left — Restock by Tuesday",
    )
  })

  it("pluralizes correctly", () => {
    expect(calculateSupply(1, 1, NOW).label).toBe(
      "~1 day left — Restock by Thursday",
    )
    expect(calculateSupply(2, 1, NOW).label).toBe(
      "~2 days left — Restock by Friday",
    )
  })

  it.each([
    ["zero frequency", 10, 0],
    ["negative frequency", 10, -1],
    ["NaN frequency", 10, Number.NaN],
    ["Infinity frequency", 10, Number.POSITIVE_INFINITY],
    ["fractional frequency", 10, 2.5],
    ["negative stock", -1, 2],
    ["fractional stock", 2.5, 1],
    ["NaN stock", Number.NaN, 1],
  ])("returns unknown for %s", (_label, stock, frequency) => {
    const supply = calculateSupply(stock, frequency, NOW)
    expect(supply.level).toBe("unknown")
    expect(supply.daysRemaining).toBeNull()
    expect(supply.restockBy).toBeNull()
    expect(supply.restockByLabel).toBeNull()
    expect(supply.label).toBe("Supply unknown — check schedule")
    expect(supplyBadgeVariant(supply.level)).toBe("outline")
  })

  it("rolls restock-by across a month end", () => {
    const november30 = new Date(2026, 10, 30, 9, 0, 0)
    const supply = calculateSupply(2, 1, november30)
    expect(supply.restockBy?.getMonth()).toBe(11)
    expect(supply.restockBy?.getDate()).toBe(2)
    // 2 days away is still a weekday label, not a formatted date.
    expect(supply.restockByLabel).toBe("Wednesday")
    expect(supply.label).toBe("~2 days left — Restock by Wednesday")
  })

  it("rolls restock-by across a year end", () => {
    const december31 = new Date(2026, 11, 31, 9, 0, 0)
    const supply = calculateSupply(1, 1, december31)
    expect(supply.restockBy?.getFullYear()).toBe(2027)
    expect(supply.restockBy?.getMonth()).toBe(0)
    expect(supply.restockBy?.getDate()).toBe(1)
    expect(supply.restockByLabel).toBe("Friday")
    expect(supply.daysRemaining).toBe(1)
  })

  it("keeps the calendar day across a DST transition", () => {
    // US DST ends on 2026-11-01; 1 day from Oct 31 stays Nov 1 (25h long).
    const october31 = new Date(2026, 9, 31, 12, 0, 0)
    const supply = calculateSupply(1, 1, october31)
    expect(supply.restockBy?.getDate()).toBe(1)
    expect(supply.restockBy?.getMonth()).toBe(10)
    expect(supply.restockByLabel).toBe("Sunday")
  })
})
