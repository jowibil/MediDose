import "dotenv/config"
import { createClient } from "@supabase/supabase-js"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceRoleKey) {
  throw new Error(
    "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local before seeding.",
  )
}

const isLocal = /127\.0\.0\.1|localhost/.test(url)
if (!isLocal && process.env.ALLOW_REMOTE_SEED !== "1") {
  throw new Error(
    "Refusing to seed a non-local Supabase project. Set ALLOW_REMOTE_SEED=1 only for disposable test projects.",
  )
}

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const PASSWORD = "medidose-test"
const OWNER_EMAIL = "owner@medidose.test"
const CAREGIVER_EMAIL = "caregiver@medidose.test"

function isoDate(offsetDays: number): string {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  return date.toISOString().slice(0, 10)
}

async function findUserByEmail(email: string) {
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
  const existing = await findUserByEmail(email)
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

async function main() {
  const ownerId = await ensureUser(OWNER_EMAIL, {
    account_type: "owner",
    display_name: "Alex Owner",
    household_name: "Seed Household",
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

  const patients = ["Alex", "Sam"]
  const patientIds: Record<string, string> = {}

  for (const name of patients) {
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

  const { data: medicine } = await admin
    .from("medicines")
    .select("id")
    .eq("patient_id", patientIds.Alex)
    .eq("name", "Amoxicillin")
    .maybeSingle()

  if (!medicine) {
    const { error } = await admin.from("medicines").insert({
      patient_id: patientIds.Alex,
      name: "Amoxicillin",
      dosage_amount: 500,
      dosage_unit: "mg",
      frequency_per_day: 2,
      schedule_mode: "waking_hours",
      first_dose_time: "08:00",
      schedule_times: ["08:00", "20:00"],
      stock_on_hand: 30,
      expiration_date: isoDate(365),
      created_by: ownerId,
    })
    if (error) throw error
  }

  console.log("Seed complete.")
  console.log(`  Owner:     ${OWNER_EMAIL} / ${PASSWORD}`)
  console.log(`  Caregiver: ${CAREGIVER_EMAIL} / ${PASSWORD}`)
  console.log(`  Household: ${household.name}`)
  console.log(`  Invite:    ${household.invite_code}`)
  console.log("Never run this script against production.")
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
