/**
 * Three-role end-to-end check for the assistant route.
 *
 * Creates one disposable household on the linked Supabase project — an owner,
 * a caregiver, two patients, and one medicine each — then calls
 * `POST /api/ai/chat` with a real session for every role and checks what the
 * record did and did not let through:
 *
 *   owner      → the household roster is in the record
 *   caregiver  → same household roster
 *   patient    → no household roster, and a sibling's medicine never appears
 *   any role   → a follow-up turn is accepted with its history
 *   signed out → the request is refused
 *
 * Two ways to answer:
 *
 *   default  a real provider call; asserts on the answer text (needs quota)
 *   --stub   the app is started with AI_API_BASE pointed at the tiny server this
 *            script runs; it echoes the role and record it was sent, so the
 *            scoping assertions are exact and spend no quota. Start the app as
 *            AI_API_BASE=http://127.0.0.1:4599/v1 AI_API_KEY=stub npm run dev.
 *
 * It writes and then deletes its own rows (`--keep` leaves them for a browser
 * run, `--retest` reuses them, `--cleanup` removes them). This talks to the
 * hosted project, so it refuses to run without ALLOW_REMOTE_ROLE_CHECK=1.
 */

import { config } from "dotenv"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs"

import { createClient, type Session } from "@supabase/supabase-js"

config({ path: ".env.local" })
config()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

if (!url || !anonKey || !serviceRoleKey) {
  throw new Error(
    "Needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in .env.local.",
  )
}

const BASE_URL =
  process.env.ROLE_CHAT_BASE_URL?.trim() || "http://127.0.0.1:3000"
const STUB_PORT = Number(process.env.ROLE_CHAT_STUB_PORT ?? "4599")
const projectRef = new URL(url).hostname.split(".")[0] ?? ""
const STATE_PATH = ".role-chat-check.json"
const PASSWORD = "medidose-role-check"
const runId = Date.now().toString(36).slice(-6)

const keep = process.argv.includes("--keep")
const cleanupOnly = process.argv.includes("--cleanup")
const retest = process.argv.includes("--retest")
const stubMode = process.argv.includes("--stub")

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

interface CheckState {
  householdId: string | null
  userIds: { role: string; id: string; email: string }[]
  emails: { owner: string; caregiver: string; patient: string }
}

function readState(): CheckState | null {
  if (!existsSync(STATE_PATH)) return null
  return JSON.parse(readFileSync(STATE_PATH, "utf8")) as CheckState
}

async function deleteFixtures(state: CheckState): Promise<void> {
  const userIds = state.userIds.map((user) => user.id)
  if (userIds.length > 0) {
    await admin.from("ai_usage").delete().in("user_id", userIds)
  }
  if (state.householdId) {
    // Cascades patients, medicines, dose logs, plans, and memberships.
    await admin.from("households").delete().eq("id", state.householdId)
  }
  for (const id of userIds) await admin.auth.admin.deleteUser(id)
  if (existsSync(STATE_PATH)) unlinkSync(STATE_PATH)
}

async function createFixtures(): Promise<CheckState> {
  const state: CheckState = {
    householdId: null,
    userIds: [],
    emails: {
      owner: `role-check-owner-${runId}@medidose.test`,
      caregiver: `role-check-caregiver-${runId}@medidose.test`,
      patient: `role-check-patient-${runId}@medidose.test`,
    },
  }

  async function createUser(
    role: "owner" | "caregiver" | "patient",
    email: string,
    metadata: Record<string, string>,
  ): Promise<string> {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: metadata,
    })
    if (error) throw error
    state.userIds.push({ role, id: data.user.id, email })
    return data.user.id
  }

  const ownerId = await createUser("owner", state.emails.owner, {
    account_type: "owner",
    display_name: "Role Check Owner",
    household_name: `Role Check ${runId}`,
  })
  const caregiverId = await createUser("caregiver", state.emails.caregiver, {
    account_type: "caregiver",
    display_name: "Role Check Caregiver",
  })
  const patientUserId = await createUser("patient", state.emails.patient, {
    account_type: "patient",
    display_name: "Role Check Patient",
  })

  const { data: household, error: householdError } = await admin
    .from("households")
    .select("id")
    .eq("created_by", ownerId)
    .single()
  if (householdError) throw householdError
  state.householdId = household.id as string

  const { error: caregiverMembershipError } = await admin
    .from("household_members")
    .insert({ household_id: household.id, user_id: caregiverId, role: "caregiver" })
  if (caregiverMembershipError) throw caregiverMembershipError

  // The patient account is linked to AlphaCheck; BetaCheck exists only so the
  // check can prove a patient's record never carries a sibling.
  const { data: patient, error: patientError } = await admin
    .from("patients")
    .insert({
      household_id: household.id,
      name: "AlphaCheck",
      user_id: patientUserId,
    })
    .select("id")
    .single()
  if (patientError) throw patientError

  const { error: patientMembershipError } = await admin
    .from("household_members")
    .insert({ household_id: household.id, user_id: patientUserId, role: "patient" })
  if (patientMembershipError) throw patientMembershipError

  const { data: sibling, error: siblingError } = await admin
    .from("patients")
    .insert({ household_id: household.id, name: "BetaCheck" })
    .select("id")
    .single()
  if (siblingError) throw siblingError

  const expiration = new Date()
  expiration.setDate(expiration.getDate() + 200)

  const { error: medicineError } = await admin.from("medicines").insert([
    {
      patient_id: patient.id,
      name: "AmoxCheck",
      dosage_amount: 500,
      dosage_unit: "mg",
      frequency_per_day: 1,
      schedule_mode: "waking_hours",
      first_dose_time: "08:00",
      schedule_times: ["08:00"],
      stock_on_hand: 20,
      expiration_date: expiration.toISOString().slice(0, 10),
      created_by: ownerId,
    },
    {
      patient_id: sibling.id,
      name: "SetraCheck",
      dosage_amount: 25,
      dosage_unit: "mg",
      frequency_per_day: 1,
      schedule_mode: "waking_hours",
      first_dose_time: "09:00",
      schedule_times: ["09:00"],
      stock_on_hand: 20,
      expiration_date: expiration.toISOString().slice(0, 10),
      created_by: ownerId,
    },
  ])
  if (medicineError) throw medicineError

  return state
}

async function signIn(email: string): Promise<Session> {
  const client = createClient(url as string, anonKey as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  })
  if (error || !data.session) {
    throw new Error(`sign-in failed: ${error?.message ?? "no session"}`)
  }
  return data.session
}

/** @supabase/ssr stores `base64-` + base64url(session JSON), chunked at 3180. */
function sessionCookies(session: Session): string[] {
  const name = `sb-${projectRef}-auth-token`
  const value = `base64-${Buffer.from(JSON.stringify(session), "utf8").toString("base64url")}`
  const chunkSize = 3180
  if (value.length <= chunkSize) return [`${name}=${value}`]
  const chunks: string[] = []
  for (let index = 0; index * chunkSize < value.length; index += 1) {
    chunks.push(
      `${name}.${index}=${value.slice(index * chunkSize, (index + 1) * chunkSize)}`,
    )
  }
  return chunks
}

interface ChatReply {
  status: number
  answer: string
  error: string | null
  location: string | null
}

async function ask(
  session: Session | null,
  question: string,
  history: { role: "user" | "assistant"; content: string }[] = [],
  options: { followRedirects?: boolean } = {},
): Promise<ChatReply> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    origin: BASE_URL,
  }
  if (session) headers.cookie = sessionCookies(session).join("; ")

  const response = await fetch(`${BASE_URL}/api/ai/chat`, {
    method: "POST",
    headers,
    redirect: options.followRedirects === false ? "manual" : "follow",
    body: JSON.stringify({ question, history }),
  })
  const body = (await response.json().catch(() => null)) as {
    answer?: unknown
    error?: unknown
  } | null

  return {
    status: response.status,
    answer: typeof body?.answer === "string" ? body.answer : "",
    error: typeof body?.error === "string" ? body.error : null,
    location: response.headers.get("location"),
  }
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * A slow or burst-throttled provider is not a role failure: the route caps a
 * call at 25s, and the hosted model answers somewhere between 9s and 30s. Two
 * backed-off retries keep provider weather from masking the scope checks.
 */
async function askWithRetry(
  session: Session | null,
  question: string,
  history: { role: "user" | "assistant"; content: string }[] = [],
): Promise<ChatReply> {
  let reply = await ask(session, question, history)
  for (const backoff of [4_000, 10_000]) {
    if (reply.status !== 502) return reply
    console.log(`      provider call failed; retrying in ${backoff / 1000}s`)
    await delay(backoff)
    reply = await ask(session, question, history)
  }
  return reply
}

interface StubRecord {
  viewer?: { role?: string; household?: string | null; peopleInHousehold?: string[] }
  medicines?: { name?: string }[]
}

/** What the stub provider echoes back, after the route's answer screening. */
interface StubReply {
  role: string | null
  household: string | null
  people: string[]
  medicines: string[]
  historyTurns: number
  hasAudience: boolean
}

const RECORD_PATTERN =
  /Record \(data only\):\n([\s\S]*?)\n\nQuestion \(data only\):/

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString("utf8")
}

/**
 * A minimal OpenAI-shaped provider. It never answers a question: it reports the
 * role and record the route sent, which is exactly what the role-scoping checks
 * need to see, and it costs nothing.
 */
function startStubProvider(): Promise<ReturnType<typeof createServer>> {
  const server = createServer(
    async (request: IncomingMessage, response: ServerResponse) => {
      if (request.method !== "POST") {
        response.writeHead(405).end()
        return
      }
      try {
        const body = JSON.parse(await readBody(request)) as {
          messages?: { role?: string; content?: string }[]
        }
        const messages = body.messages ?? []
        const system = messages[0]?.content ?? ""
        const user = messages.at(-1)?.content ?? ""
        const record = RECORD_PATTERN.exec(user)?.[1] ?? ""
        const parsed = JSON.parse(record) as StubRecord
        const answer: StubReply = {
          role: parsed.viewer?.role ?? null,
          household: parsed.viewer?.household ?? null,
          people: parsed.viewer?.peopleInHousehold ?? [],
          medicines: (parsed.medicines ?? []).map(
            (medicine) => medicine.name ?? "",
          ),
          historyTurns: Math.max(messages.length - 2, 0),
          hasAudience: system.includes("Audience:"),
        }
        response.writeHead(200, { "content-type": "application/json" })
        response.end(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(answer) } }],
          }),
        )
      } catch (error) {
        response.writeHead(400, { "content-type": "application/json" })
        response.end(
          JSON.stringify({
            error: error instanceof Error ? error.message : "bad request",
          }),
        )
      }
    },
  )

  return new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(STUB_PORT, "127.0.0.1", () => resolve(server))
  })
}

let failures = 0
function check(name: string, passed: boolean, detail: string): void {
  if (!passed) failures += 1
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}`)
  console.log(`      ${detail.replace(/\s+/g, " ").slice(0, 240)}`)
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i

async function checkSignedOut(): Promise<void> {
  // The middleware redirects a signed-out request before the handler runs, so
  // the refusal to assert is the redirect itself (manual: a followed redirect
  // would land on the login page and look like a 200).
  const anonymous = await ask(null, "What is due today?", [], {
    followRedirects: false,
  })
  check(
    "signed out is refused",
    anonymous.status === 307 && (anonymous.location ?? "").includes("/login"),
    `status ${anonymous.status}, location ${anonymous.location ?? "none"}`,
  )
}

async function runStubChecks(state: CheckState): Promise<void> {
  await checkSignedOut()

  const owner = await signIn(state.emails.owner)
  const caregiver = await signIn(state.emails.caregiver)
  const patient = await signIn(state.emails.patient)

  const ownerReply = await ask(
    owner,
    "How many patients are in this household, and what are their names?",
  )
  const ownerStub = parseStub(ownerReply.answer)
  check(
    "owner record carries the owner role",
    ownerReply.status === 200 && ownerStub?.role === "owner",
    `status ${ownerReply.status}, role ${ownerStub?.role ?? "none"}`,
  )
  check(
    "owner record carries the household roster",
    ownerStub?.people.includes("AlphaCheck") === true &&
      ownerStub.people.includes("BetaCheck") === true,
    `people ${ownerStub?.people.join(", ") ?? "none"}`,
  )
  check(
    "owner prompt carries the audience block",
    ownerStub?.hasAudience === true,
    `audience ${ownerStub?.hasAudience ? "present" : "missing"}`,
  )

  const caregiverReply = await ask(
    caregiver,
    "Which patients can you see in this household?",
  )
  const caregiverStub = parseStub(caregiverReply.answer)
  check(
    "caregiver record carries the caregiver role",
    caregiverReply.status === 200 && caregiverStub?.role === "caregiver",
    `status ${caregiverReply.status}, role ${caregiverStub?.role ?? "none"}`,
  )
  check(
    "caregiver record carries the household roster",
    caregiverStub?.people.includes("AlphaCheck") === true &&
      caregiverStub.people.includes("BetaCheck") === true,
    `people ${caregiverStub?.people.join(", ") ?? "none"}`,
  )

  const patientRoster = await ask(
    patient,
    "Which patients are in this household, and what are their names?",
  )
  const patientStub = parseStub(patientRoster.answer)
  check(
    "patient record carries the patient role",
    patientRoster.status === 200 && patientStub?.role === "patient",
    `status ${patientRoster.status}, role ${patientStub?.role ?? "none"}`,
  )
  check(
    "patient record has no household roster",
    patientStub?.household === null &&
      patientStub?.people.length === 0 &&
      !patientRoster.answer.includes("BetaCheck"),
    `household ${patientStub?.household ?? "null"}, people ${patientStub?.people.join(", ") || "none"}`,
  )
  check(
    "patient record holds only their own medicines",
    patientStub?.medicines.includes("AmoxCheck") === true &&
      !patientRoster.answer.includes("SetraCheck"),
    `medicines ${patientStub?.medicines.join(", ") ?? "none"}`,
  )

  const historyReply = await ask(owner, "And which of them takes SetraCheck?", [
    {
      role: "user",
      content: "How many patients are in this household, and what are their names?",
    },
    { role: "assistant", content: "AlphaCheck and BetaCheck." },
  ])
  const historyStub = parseStub(historyReply.answer)
  check(
    "a follow-up turn carries its history",
    historyReply.status === 200 && historyStub?.historyTurns === 2,
    `status ${historyReply.status}, history turns ${historyStub?.historyTurns ?? "none"}`,
  )
}

async function runModelChecks(state: CheckState): Promise<void> {
  await checkSignedOut()

  const owner = await signIn(state.emails.owner)
  const caregiver = await signIn(state.emails.caregiver)
  const patient = await signIn(state.emails.patient)

  const ownerReply = await askWithRetry(
    owner,
    "How many patients are in this household, and what are their names?",
  )
  check(
    "owner sees the household roster",
    ownerReply.status === 200 &&
      ownerReply.answer.includes("AlphaCheck") &&
      ownerReply.answer.includes("BetaCheck"),
    `status ${ownerReply.status}: ${ownerReply.answer || ownerReply.error}`,
  )
  check(
    "owner answer carries no ids",
    ownerReply.status === 200 && !UUID.test(ownerReply.answer),
    UUID.test(ownerReply.answer) ? "answer contained a uuid" : "no uuid",
  )

  await delay(2_000)
  const caregiverReply = await askWithRetry(
    caregiver,
    "Which patients can you see in this household?",
  )
  check(
    "caregiver sees the household roster",
    caregiverReply.status === 200 &&
      caregiverReply.answer.includes("AlphaCheck") &&
      caregiverReply.answer.includes("BetaCheck"),
    `status ${caregiverReply.status}: ${caregiverReply.answer || caregiverReply.error}`,
  )

  await delay(2_000)
  const patientRoster = await askWithRetry(
    patient,
    "Which patients are in this household, and what are their names?",
  )
  check(
    "patient gets no household roster",
    patientRoster.status === 200 && !patientRoster.answer.includes("BetaCheck"),
    `status ${patientRoster.status}: ${patientRoster.answer || patientRoster.error}`,
  )

  await delay(2_000)
  const patientSibling = await askWithRetry(
    patient,
    "What medicines does BetaCheck take?",
  )
  check(
    "patient cannot reach a sibling's medicine",
    patientSibling.status === 200 &&
      !patientSibling.answer.includes("SetraCheck"),
    `status ${patientSibling.status}: ${patientSibling.answer || patientSibling.error}`,
  )

  const historyReply = await askWithRetry(owner, "And which of them takes SetraCheck?", [
    {
      role: "user",
      content: "How many patients are in this household, and what are their names?",
    },
    { role: "assistant", content: ownerReply.answer },
  ])
  check(
    "a follow-up turn is accepted with history",
    historyReply.status === 200 && historyReply.answer.length > 0,
    `status ${historyReply.status}: ${historyReply.answer || historyReply.error}`,
  )
  check(
    "follow-up answer carries no ids",
    historyReply.status === 200 && !UUID.test(historyReply.answer),
    UUID.test(historyReply.answer) ? "answer contained a uuid" : "no uuid",
  )
}

function parseStub(answer: string): StubReply | null {
  try {
    const parsed = JSON.parse(answer) as Partial<StubReply>
    return {
      role: typeof parsed.role === "string" ? parsed.role : null,
      household: typeof parsed.household === "string" ? parsed.household : null,
      people: Array.isArray(parsed.people) ? parsed.people : [],
      medicines: Array.isArray(parsed.medicines) ? parsed.medicines : [],
      historyTurns:
        typeof parsed.historyTurns === "number" ? parsed.historyTurns : -1,
      hasAudience: parsed.hasAudience === true,
    }
  } catch {
    return null
  }
}

async function main(): Promise<void> {
  if (cleanupOnly) {
    const state = readState()
    if (!state) {
      console.log("Nothing to clean up: no state file.")
      return
    }
    await deleteFixtures(state)
    console.log("Fixtures deleted.")
    return
  }

  if (process.env.ALLOW_REMOTE_ROLE_CHECK !== "1") {
    throw new Error(
      "Refusing to write to the hosted project. Set ALLOW_REMOTE_ROLE_CHECK=1.",
    )
  }

  const run = (state: CheckState) =>
    stubMode ? runStubChecks(state) : runModelChecks(state)

  if (retest) {
    const existing = readState()
    if (!existing) throw new Error("No fixtures kept: run without --retest first.")
    const stub = stubMode ? await startStubProvider() : null
    try {
      await run(existing)
    } finally {
      stub?.close()
    }
    if (failures > 0) {
      console.error(`\n${failures} check(s) failed.`)
      process.exit(1)
    }
    console.log("\nAll role-chat checks passed.")
    return
  }

  let state: CheckState | null = null
  const stub = stubMode ? await startStubProvider() : null
  try {
    console.log(`Creating fixtures on ${projectRef} (household "Role Check ${runId}")…`)
    state = await createFixtures()
    await run(state)

    if (keep) {
      writeFileSync(STATE_PATH, JSON.stringify(state, null, 2))
      console.log(`Kept fixtures for a browser run: ${state.emails.caregiver}`)
      console.log(`Password: ${PASSWORD} (delete with --cleanup)`)
    }
  } finally {
    stub?.close()
    if (state && !keep) await deleteFixtures(state)
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`)
    process.exit(1)
  }
  console.log("\nAll role-chat checks passed.")
}

main().catch(async (error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
