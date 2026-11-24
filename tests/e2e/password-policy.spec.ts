import { expect, test } from "@playwright/test"

import { loadFixtures, login } from "./helpers"

test("signup rejects a weak password through the UI", async ({ page }) => {
  await page.goto("/signup")
  await page.getByLabel("Your name").fill("Policy Tester")
  await page
    .getByLabel("Email")
    .fill(`weak-signup-${Date.now()}@medidose.test`)
  await page.getByLabel("Password", { exact: true }).fill("password")
  await page.getByLabel("Confirm password").fill("password")
  await page.getByRole("button", { name: "Create household account" }).click()

  await expect(page.getByRole("alert")).toContainText("too common")
  await expect(page).toHaveURL(/\/signup/)
})

test("reset-password rejects a weak password through the UI", async ({ page }) => {
  const fixtures = loadFixtures()
  await login(page, fixtures.caregiverEmail, fixtures.password)

  await page.goto("/reset-password")
  await page.getByLabel("New password", { exact: true }).fill("qwertyuiop")
  await page.getByLabel("Confirm new password").fill("qwertyuiop")
  await page.getByRole("button", { name: "Update password" }).click()

  await expect(page.getByRole("alert")).toContainText("too common")
  // The session and password are untouched by a rejected change.
  await page.goto("/dashboard")
  await expect(page).toHaveURL(/\/dashboard/)
})

test("Supabase Auth rejects a weak password directly", async ({ request }) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  expect(url && anonKey).toBeTruthy()

  const response = await request.post(`${url}/auth/v1/signup`, {
    headers: {
      apikey: anonKey as string,
      "Content-Type": "application/json",
    },
    data: {
      email: `weak-direct-${Date.now()}@medidose.test`,
      password: "password",
    },
  })

  expect(response.status()).toBeGreaterThanOrEqual(400)
  const body = (await response.json()) as {
    error_code?: string
    msg?: string
    message?: string
  }
  expect(`${body.error_code ?? ""} ${body.msg ?? body.message ?? ""}`).toMatch(
    /weak_password|weak password|at least 10/i,
  )
})
