import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"
import type { Page } from "@playwright/test"

export interface Fixtures {
  ownerEmail: string
  caregiverEmail: string
  password: string
  householdId: string
  householdName: string
  inviteCode: string
  patientIds: Record<string, string>
  medicineId: string
}

export function loadFixtures(): Fixtures {
  return JSON.parse(
    readFileSync("tests/e2e/.fixtures.json", "utf8"),
  ) as Fixtures
}

export async function login(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto("/login")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(password)
  await page.getByRole("button", { name: "Sign in" }).click()
  await page.waitForURL("**/dashboard")
}

/**
 * Restores the fixture medicine to a known state before a flow. E2E runs in
 * Node, so the service-role key stays out of the browser bundle.
 */
export async function resetDoseState(fixtures: Fixtures): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) return

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  await admin.from("dose_logs").delete().eq("medicine_id", fixtures.medicineId)
  await admin
    .from("stock_adjustments")
    .delete()
    .eq("medicine_id", fixtures.medicineId)
  await admin
    .from("medicines")
    .update({ stock_on_hand: 30, archived_at: null })
    .eq("id", fixtures.medicineId)
}
