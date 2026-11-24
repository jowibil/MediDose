import "dotenv/config"
import { writeFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export const FIXTURES_PATH = "tests/e2e/.fixtures.json"
export const PASSWORD = "medidose-test"
export const OWNER_EMAIL = "owner@medidose.test"
export const CAREGIVER_EMAIL = "caregiver@medidose.test"

function isoDate(offsetDays: number): string {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  return date.toISOString().slice(0, 10)
}

async function main() {
  if (!url || !serviceRoleKey) {
    throw new Error(
      "E2E requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (local Supabase).",
    )
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  async function findUser(email: string) {
    const { data, error } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    })
    if (error) throw error
    return data.users.find((user) => user.email === email) ?? null
  }

  async function ensureUser(
    email: string,
    metadata: Record<string, string>,
  ): Promise<string> {
    const existing = await findUser(email)
    if (existing) return existing.id
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: metadata,
    })
    if (error) throw error
    return data.user.id
  }

  const ownerId = await ensureUser(OWNER_EMAIL, {
    account_type: "owner",
    display_name: "Alex Owner",
    household_name: "Playwright Household",
  })
  await ensureUser(CAREGIVER_EMAIL, {
    account_type: "caregiver",
    display_name: "Casey Caregiver",
  })

  const { data: household, error: householdError } = await admin
    .from("households")
    .select("id, name, invite_code")
    .eq("created_by", ownerId)
    .single()
  if (householdError) throw householdError

  const patientIds: Record<string, string> = {}
  for (const name of ["Alex", "Sam"]) {
    const { data: existing } = await admin
      .from("patients")
      .select("id")
      .eq("household_id", household.id)
      .eq("name", name)
      .maybeSingle()

    if (existing) {
      patientIds[name] = existing.id
      continue
    }

    const { data, error } = await admin
      .from("patients")
      .insert({ household_id: household.id, name })
      .select("id")
      .single()
    if (error) throw error
    patientIds[name] = data.id
  }

  const { data: medicine, error: medicineError } = await admin
    .from("medicines")
    .select("id")
    .eq("patient_id", patientIds.Alex)
    .eq("name", "Test Medicine")
    .maybeSingle()
  if (medicineError) throw medicineError

  let medicineId = medicine?.id as string | undefined

  if (!medicineId) {
    const { data, error } = await admin
      .from("medicines")
      .insert({
        patient_id: patientIds.Alex,
        name: "Test Medicine",
        dosage_amount: 250,
        dosage_unit: "mg",
        frequency_per_day: 1,
        schedule_mode: "waking_hours",
        first_dose_time: "08:00",
        schedule_times: ["08:00"],
        stock_on_hand: 30,
        expiration_date: isoDate(365),
        created_by: ownerId,
      })
      .select("id")
      .single()
    if (error) throw error
    medicineId = data.id as string
  }

  // Clear any throttle history from earlier runs so joins stay deterministic.
  await admin
    .from("join_attempts")
    .delete()
    .neq("user_id", "00000000-0000-0000-0000-000000000000")

  // Deterministic starting state for the skip flow.
  await admin.from("dose_logs").delete().eq("medicine_id", medicineId)
  await admin.from("stock_adjustments").delete().eq("medicine_id", medicineId)
  await admin
    .from("medicines")
    .update({ stock_on_hand: 30, archived_at: null })
    .eq("id", medicineId)

  writeFileSync(
    FIXTURES_PATH,
    JSON.stringify(
      {
        ownerEmail: OWNER_EMAIL,
        caregiverEmail: CAREGIVER_EMAIL,
        password: PASSWORD,
        householdId: household.id,
        householdName: household.name,
        inviteCode: household.invite_code,
        patientIds,
        medicineId,
      },
      null,
      2,
    ),
  )
}

export default main
