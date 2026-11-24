import { describe, expect, it } from "vitest"

import type { MedicineFormValues } from "@/lib/validation"
import {
  normalizeInviteCode,
  validateInviteCode,
  validateMedicineForm,
  validateRestockQuantity,
  validateSkipInput,
} from "@/lib/validation"

const valid: MedicineFormValues = {
  name: "Amoxicillin",
  patientId: "patient-1",
  newPatientName: "",
  dosageAmount: "500",
  dosageUnit: "mg",
  stock: "30",
  expirationDate: "2027-03-01",
  frequencyPerDay: "3",
  firstDoseTime: "08:00",
  treatmentEndDate: "",
  scheduleMode: "waking_hours",
  customTimes: [],
}

const options = { todayIso: "2026-11-25" }

describe("validateMedicineForm", () => {
  it("accepts a valid form", () => {
    expect(validateMedicineForm(valid, options)).toEqual({})
  })

  it("requires a patient unless a new patient name is supplied", () => {
    expect(
      validateMedicineForm({ ...valid, patientId: "" }, options).patientId,
    ).toBeTruthy()
    expect(
      validateMedicineForm(
        { ...valid, patientId: "", newPatientName: "Alex" },
        options,
      ).patientId,
    ).toBeUndefined()
  })

  it("rejects numbers-only names", () => {
    expect(
      validateMedicineForm({ ...valid, name: "12345" }, options).name,
    ).toContain("only numbers")
  })

  it("rejects symbols in names", () => {
    expect(
      validateMedicineForm({ ...valid, name: "Aspirin<script>" }, options).name,
    ).toContain("can only contain")
  })

  it("requires positive dosage and whole non-negative stock", () => {
    expect(
      validateMedicineForm({ ...valid, dosageAmount: "0" }, options).dosageAmount,
    ).toBeTruthy()
    expect(
      validateMedicineForm({ ...valid, stock: "-1" }, options).stock,
    ).toBeTruthy()
    expect(
      validateMedicineForm({ ...valid, stock: "1.5" }, options).stock,
    ).toBeTruthy()
    expect(validateMedicineForm({ ...valid, stock: "0" }, options).stock).toBeUndefined()
  })

  it("rejects past expiration and treatment dates", () => {
    expect(
      validateMedicineForm({ ...valid, expirationDate: "2026-11-24" }, options)
        .expirationDate,
    ).toBeTruthy()
    expect(
      validateMedicineForm({ ...valid, treatmentEndDate: "2026-11-24" }, options)
        .treatmentEndDate,
    ).toBeTruthy()
  })

  it("requires frequency between 1 and 6", () => {
    expect(
      validateMedicineForm({ ...valid, frequencyPerDay: "0" }, options)
        .frequencyPerDay,
    ).toBeTruthy()
    expect(
      validateMedicineForm({ ...valid, frequencyPerDay: "7" }, options)
        .frequencyPerDay,
    ).toBeTruthy()
  })

  it("requires exactly one custom time per dose", () => {
    const form = {
      ...valid,
      scheduleMode: "custom" as const,
      customTimes: ["08:00", "13:00"],
    }
    expect(validateMedicineForm(form, options).customTimes).toContain("exactly 3")
    expect(
      validateMedicineForm(
        { ...form, customTimes: ["08:00", "13:00", "19:00"] },
        options,
      ).customTimes,
    ).toBeUndefined()
    expect(
      validateMedicineForm(
        { ...form, customTimes: ["08:00", "13:00", "25:00"] },
        options,
      ).customTimes,
    ).toContain("HH:MM")
  })
})

describe("validateSkipInput", () => {
  it("requires one of the four reasons", () => {
    expect(validateSkipInput(null, "").ok).toBe(false)
    expect(validateSkipInput("missed", "").ok).toBe(false)
  })

  it("accepts a reason with no note", () => {
    expect(validateSkipInput("forgot", "")).toEqual({
      ok: true,
      reason: "forgot",
      note: null,
    })
  })

  it("trims notes and converts blanks to null", () => {
    expect(validateSkipInput("felt_unwell", "  nauseous  ")).toEqual({
      ok: true,
      reason: "felt_unwell",
      note: "nauseous",
    })
  })

  it("rejects notes over 500 characters", () => {
    expect(validateSkipInput("forgot", "x".repeat(501)).ok).toBe(false)
    expect(validateSkipInput("forgot", "x".repeat(500)).ok).toBe(true)
  })
})

describe("validateRestockQuantity", () => {
  it("accepts 1 through 10,000", () => {
    expect(validateRestockQuantity(1)).toBeNull()
    expect(validateRestockQuantity("10")).toBeNull()
    expect(validateRestockQuantity(10_000)).toBeNull()
  })

  it("rejects zero, negatives, fractions, and over-limit", () => {
    expect(validateRestockQuantity(0)).toBeTruthy()
    expect(validateRestockQuantity(-5)).toBeTruthy()
    expect(validateRestockQuantity("1.5")).toBeTruthy()
    expect(validateRestockQuantity(10_001)).toBeTruthy()
  })
})

describe("invite codes", () => {
  it("normalizes case, spaces, and hyphens", () => {
    expect(normalizeInviteCode(" ab-cd 23 ")).toBe("ABCD23")
  })

  it("rejects look-alike characters and wrong lengths", () => {
    expect(validateInviteCode("ABCD23")).toBeNull()
    expect(validateInviteCode("ABCD2O")).toBeTruthy()
    expect(validateInviteCode("ABC")).toBeTruthy()
  })
})
