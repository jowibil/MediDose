import { expect, test } from "@playwright/test"

import { loadFixtures, login, resetDoseState } from "./helpers"

test("caregiver joins, switches patients, restocks, and logs a dose", async ({
  page,
}) => {
  const fixtures = loadFixtures()
  await resetDoseState(fixtures)
  await login(page, fixtures.caregiverEmail, fixtures.password)

  await page.goto("/join")
  await page.getByLabel("Invite code").fill(fixtures.inviteCode)
  await page.getByRole("button", { name: "Join household" }).click()
  await expect(page.getByText(/You joined/)).toBeVisible()

  await page.goto("/dashboard")
  await expect(page.getByLabel("Active patient")).toBeVisible()

  await page.getByLabel("Active patient").click()
  await page.getByRole("option", { name: "Sam" }).click()
  await expect(page.getByText(/Sam/).first()).toBeVisible()

  // Switch back to the patient with a medicine.
  await page.getByLabel("Active patient").click()
  await page.getByRole("option", { name: "Alex" }).click()

  await page.goto("/medicines?tab=inventory")
  await page.getByRole("button", { name: "Restock" }).first().click()
  await page.getByLabel("Doses to add").fill("5")
  await page.getByRole("button", { name: "Add stock" }).click()
  await expect(page.getByRole("button", { name: "Restock" }).first()).toBeVisible()

  // Logging happens in History; the dashboard only reports the status.
  await page.goto("/history")
  await page.getByRole("button", { name: "Take" }).first().click()
  await expect(page.getByText("Taken").first()).toBeVisible()
})
