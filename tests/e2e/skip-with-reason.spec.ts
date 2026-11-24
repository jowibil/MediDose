import { expect, test } from "@playwright/test"

import { loadFixtures, login, resetDoseState } from "./helpers"

test("owner skips a dose with a reason and filters history", async ({ page }) => {
  const fixtures = loadFixtures()
  await resetDoseState(fixtures)
  await login(page, fixtures.ownerEmail, fixtures.password)

  await page.goto("/dashboard")
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
