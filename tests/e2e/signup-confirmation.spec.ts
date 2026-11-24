import { expect, test, type Page } from "@playwright/test"

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000"
const INBUCKET_URL = process.env.INBUCKET_URL ?? "http://localhost:54324"
const PASSWORD = "correct-horse-battery"

function uniqueEmail(): string {
  return `confirm-${Date.now()}-${Math.floor(Math.random() * 1000)}@medidose.test`
}

async function signUp(page: Page, email: string): Promise<void> {
  await page.goto("/signup")
  await page.getByLabel("Your name").fill("Refresh Tester")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD)
  await page.getByLabel("Confirm password").fill(PASSWORD)
  await page.getByRole("button", { name: "Create household account" }).click()
}

interface InbucketMessage {
  body?: { text?: string | null; html?: string | null } | null
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Polls Inbucket (local Supabase) for the newest message to `email`. */
async function waitForConfirmationLink(email: string): Promise<string> {
  const mailbox = encodeURIComponent(email)

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const list = await fetch(`${INBUCKET_URL}/api/v1/mailbox/${mailbox}`)
    if (list.ok) {
      const messages = (await list.json()) as Array<{ id?: string }>
      const id = messages.at(-1)?.id
      if (id) {
        const response = await fetch(
          `${INBUCKET_URL}/api/v1/mailbox/${mailbox}/${id}`,
        )
        if (response.ok) {
          const message = (await response.json()) as InbucketMessage
          // The text part carries the raw URL; the HTML one is entity-escaped.
          const body = message.body?.text || message.body?.html || ""
          const match = body.match(/https?:\/\/[^\s"'<>]+/)
          if (match) return match[0].replaceAll("&amp;", "&")
        }
      }
    }
    await sleep(500)
  }

  throw new Error(`No auth email for ${email} arrived at ${INBUCKET_URL}`)
}

test("signup shows the waiting state and a hard refresh keeps it", async ({
  page,
}) => {
  const email = uniqueEmail()
  await signUp(page, email)

  await expect(page).toHaveURL(/\/signup\/check-email\?/)
  await expect(page.getByText("Check your email", { exact: true })).toBeVisible()
  await expect(page.getByText(email)).toBeVisible()

  await page.reload()

  await expect(page.getByText("Check your email", { exact: true })).toBeVisible()
  await expect(page.getByText(email)).toBeVisible()
  // The form is gone, so nothing sensitive is repopulated.
  await expect(page.getByLabel("Confirm password")).toHaveCount(0)
})

test("resend respects the 60-second cooldown", async ({ page }) => {
  const email = uniqueEmail()
  await signUp(page, email)

  await page.getByRole("button", { name: "Resend confirmation email" }).click()

  await expect(page.getByRole("status")).toContainText(
    "If that address still needs confirming",
  )
  await expect(page.getByRole("button", { name: /Resend in \d+s/ })).toBeDisabled()
})

test("the emailed link uses the app origin and lands on the dashboard", async ({
  page,
}) => {
  const email = uniqueEmail()
  await signUp(page, email)

  const link = await waitForConfirmationLink(email)
  const url = new URL(link)

  // Either our Send Email Hook's direct /auth/confirm link or Supabase's
  // verify endpoint carrying `redirect_to`; both must point at this app.
  const appTarget =
    url.pathname === "/auth/confirm"
      ? url.toString()
      : url.searchParams.get("redirect_to")
  expect(appTarget, "email link carries an app redirect").toBeTruthy()
  expect(new URL(appTarget as string).origin).toBe(new URL(BASE_URL).origin)

  await page.goto(link)
  await expect(page).toHaveURL((current) => {
    const arrived = new URL(current)
    return (
      arrived.origin === new URL(BASE_URL).origin &&
      arrived.pathname === "/dashboard"
    )
  })
})
