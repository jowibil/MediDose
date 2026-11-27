import { expect, test } from "@playwright/test"

import { loadFixtures, login, resetDoseState } from "./helpers"

test("caregiver skips a dose with a reason and filters history", async ({
  page,
}) => {
  const fixtures = loadFixtures()
  await resetDoseState(fixtures)
  await login(page, fixtures.caregiverEmail, fixtures.password)

  await page.goto("/dashboard")

  // A caregiver's active patient is a per-session choice; the fixture medicine
  // belongs to Alex, so select that record explicitly.
  await page.getByLabel("Active patient").click()
  await page.getByRole("option", { name: "Alex" }).click()

  await page.getByRole("button", { name: "Skip" }).first().click()

  await expect(
    page.getByRole("heading", { name: "Why was this dose skipped?" }),
  ).toBeVisible()

  await page.getByRole("radio", { name: "Felt unwell" }).check()
  await page
    .getByLabel("Add a note (optional)")
    .fill("Queasy after breakfast")
  await page.getByRole("button", { name: "Mark as skipped" }).click()

  await expect(page.getByText("Skipped · Felt unwell").first()).toBeVisible()

  await page.goto("/history?reason=felt_unwell")
  await expect(page.getByText("Queasy after breakfast").first()).toBeVisible()
  await expect(page.getByText("Felt unwell").first()).toBeVisible()
})
