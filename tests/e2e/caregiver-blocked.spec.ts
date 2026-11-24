import { expect, test } from "@playwright/test"

import { loadFixtures, login } from "./helpers"

test("caregiver is blocked from editing in the UI and over REST", async ({
  page,
  request,
}) => {
  const fixtures = loadFixtures()
  await login(page, fixtures.caregiverEmail, fixtures.password)

  // Ensure the caregiver is actually linked before testing row/column limits.
  await page.goto("/join")
  await page.getByLabel("Invite code").fill(fixtures.inviteCode)
  await page.getByRole("button", { name: "Join household" }).click()
  await expect(page.getByText(/You joined/)).toBeVisible()

  await page.goto("/medicines")
  await expect(page.getByRole("link", { name: "Add medicine" })).toHaveCount(0)
  await expect(page.getByRole("link", { name: "Edit" })).toHaveCount(0)

  await page.goto("/settings")
  await expect(page.getByText("Settings are owner-only")).toBeVisible()

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  expect(url && anonKey).toBeTruthy()

  const tokenResponse = await request.post(
    `${url}/auth/v1/token?grant_type=password`,
    {
      headers: { apikey: anonKey as string, "Content-Type": "application/json" },
      data: { email: fixtures.caregiverEmail, password: fixtures.password },
    },
  )
  expect(tokenResponse.ok()).toBeTruthy()
  const { access_token: accessToken } = await tokenResponse.json()

  const updateResponse = await request.patch(
    `${url}/rest/v1/medicines?id=eq.${fixtures.medicineId}`,
    {
      headers: {
        apikey: anonKey as string,
        Authorization: `Bearer ${accessToken}`,
        Prefer: "return=representation",
        "Content-Type": "application/json",
      },
      data: { name: "Hacked by caregiver" },
    },
  )
  if (updateResponse.ok()) {
    expect(await updateResponse.json()).toEqual([])
  } else {
    expect(updateResponse.status()).toBeGreaterThanOrEqual(400)
  }

  const inviteResponse = await request.get(
    `${url}/rest/v1/households?select=invite_code&id=eq.${fixtures.householdId}`,
    {
      headers: {
        apikey: anonKey as string,
        Authorization: `Bearer ${accessToken}`,
      },
    },
  )
  expect(inviteResponse.status()).toBeGreaterThanOrEqual(400)

  const doseInsert = await request.post(`${url}/rest/v1/dose_logs`, {
    headers: {
      apikey: anonKey as string,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    data: {
      medicine_id: fixtures.medicineId,
      patient_id: fixtures.patientIds.Alex,
      scheduled_date: "2026-01-02",
      scheduled_time: "08:00",
      scheduled_for: new Date().toISOString(),
      status: "taken",
    },
  })
  expect(doseInsert.status()).toBeGreaterThanOrEqual(400)
})
