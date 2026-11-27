# MediDose

> Precision Medicine, Trusted Care.

MediDose is a household medication tracker: schedules, stock, expiration dates,
dose history, and caregiver access. It runs on **Next.js (App Router,
TypeScript)** with **Supabase** (Postgres, Auth, Row Level Security).

## Features

- **Smart schedules** — waking-hours distribution (first dose → 10:00 PM),
  strict every-N-hours intervals (e.g. 4×/day every 4 hours → 8 AM, 12 NN,
  4 PM, 8 PM), and custom times.
- **Skipped-dose reasons** — Pending / Taken / Skipped, with exactly one of
  Forgot, Out of stock, Felt unwell, or Doctor advised, plus an optional
  500-character note. Reasons are filterable in history.
- **Days of supply** — one pure function (`src/lib/supply.ts`) drives every
  badge: “~2 days left — Restock by Thursday”, red at 0–2 days, amber at 3–7,
  neutral above 7, and “Less than 1 day left” when stock is positive but under
  one day.
- **Caregiver households** — owners create a household with a six-character
  invite code; caregivers join and see a grouped, single-patient top-bar
  selector. Owners manage patients and medicines and correct logged doses;
  caregivers log doses from History, correct them, and restock.
- **Audited stock** — every delta (initial, dose taken, reverted, restock,
  owner edit) is recorded in `stock_adjustments`.
- **Expiration board** — Safe / Expiring soon (≤30 days) / Expired, with
  archive instead of silent deletion.
- **Three roles** — owner, caregiver, and a **patient account** bound to one
  patient record through a six-character link code the owner issues. A patient
  sees only their own doses and history, logs pending doses from the dashboard,
  and can correct nothing (History is read-only); a caregiver logs and corrects
  doses in History, while an owner corrects Taken ↔ Skipped there rather than
  logging a new one. Both see today's status, with no controls, on the
  dashboard.
- **Weekly summaries** — the first visit to a week freezes its expected doses, so
  later schedule edits cannot rewrite it. AI writes an English + Filipino
  summary from those frozen counters; a person marks it reviewed, and
  regenerating overwrites the row and clears the flag.
- **Bilingual assistant** — “Ask MediDose” is a chat panel that answers only
  from the active patient’s record, in English or Filipino (a `md_lang` cookie
  plus the prompt), behind deterministic guardrails and a daily quota. The
  record is scoped by the reader’s role: an owner sees the household, a
  caregiver sees its patients with their narrower abilities, and a patient
  account sees only its own record plus app guidance.
- **Pharmacy list** — one household-wide list split into Restock / Expiring soon /
  Expired, with a patient name on every row, plus copy-to-clipboard and print
  styles that drop the shell.
- **Disposal** — one-click discard for an expired medicine, a confirmed
  “Dispose…” in the cabinet for a damaged or mistaken entry, and an inline undo
  for 30 seconds that restores the stock and the week’s expected doses.

## Role model

| Capability | Owner | Caregiver | Patient account |
| --- | --- | --- | --- |
| **Dashboard** dose rows | Status only — Pending / Taken / Skipped | Status only — Pending / Taken / Skipped | Status, plus **Take** / **Skip** on their own doses |
| **History** dose rows | Correct a logged dose — *Undo* back to Pending, Taken ↔ Skipped, or the skip reason — no new log | Log a pending dose, correct a logged one, change a skip reason | Read-only status |
| Log a new Taken / Skipped dose | No — corrections only | Yes, from History | Yes, own doses, from the dashboard |
| Correct a logged dose (Undo to Pending, Taken ↔ Skipped) | Yes | Yes | No — asks a caregiver |
| View patients, medicines, doses, stock ledger | Own household | Linked households | Own record only |
| Create / edit / archive / purge / dispose patients & medicines | Yes | No | No |
| Restock | Yes | Yes | No |
| Weekly summaries | Yes | Yes | No |
| Bilingual assistant | Whole household | Its patients | Own record + app guidance |
| View / regenerate the invite code, rename household, remove caregivers | Yes | No | No |
| Join another household | No (fixed role) | Yes, many | No — bound to one patient record |
| Issue / redeem a patient link code | Issues it | — | Redeems it, once |

A dose action lives in exactly one place per role: an owner and a caregiver
read today's status on the dashboard and act in History, while a patient account
is the reverse — it logs from the dashboard and reads History as a record. That
is why a staff dashboard row has no Take, Skip, Undo or Mark taken button.

*Undo* clears a mistaken entry rather than inventing a reason for it: the log is
deleted, so the slot is Pending again and can be logged correctly, and a taken
dose’s unit goes back to stock with a `dose_reverted` ledger row naming who
returned it. It stays staff-only because returning stock is an accounting
correction — a patient asks a caregiver.

Roles are chosen at signup and cannot change. An owner has exactly one
household and can never join another. A patient account is one patient record in
one household, linked by the owner’s six-character code (single use, throttled,
readable only by the owner). `user_metadata.account_type` only routes the UI —
never authorizes anything. Enforced in the database, not just the UI: `log_dose`
accepts a caregiver of the patient's household or the linked patient, refuses an
owner, and the owner's only dose action is correcting a log through
`update_dose_status`.

## Prerequisites

- Node.js 20+
- Docker (for local Supabase)
- Supabase CLI
- `psql` (for the SQL RLS suite)

## Setup

```bash
npm install
cp .env.example .env.local   # fill in your Supabase values
```

Environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — browser-safe.
- `NEXT_PUBLIC_SITE_URL` — the public origin used in auth email links. Set it
  in Vercel for **Production only**; leave it unset in Preview so each preview
  deployment falls back to its own `VERCEL_URL`. Unset it locally to fall back
  to the request headers and `http://localhost:3000`.
- `SUPABASE_SERVICE_ROLE_KEY` — **server/tests only**; never imported into
  `src/`. If your project uses Supabase’s newer publishable/secret key naming,
  map them to these variables.
- `DATABASE_URL` — local Postgres for `npm run test:rls`.
- `AI_API_KEY` — server-only key for the OpenAI-compatible endpoint used by the
  weekly summary and the assistant. With no key both surfaces say so instead of
  failing the page.
- `AI_API_BASE` — the endpoint base; defaults to Gemini’s OpenAI-compatible
  layer (`https://generativelanguage.googleapis.com/v1beta/openai`).
- `AI_MODEL` — the model name that endpoint accepts (`gemini-3.6-flash` today).

### Local Supabase

```bash
npm run db:start     # Postgres, Auth, Studio, Inbucket
npm run db:reset     # applies supabase/migrations/*
npm run seed         # optional local fixtures (never run against production)
npm run dev          # http://localhost:3000
```

Local auth emails land in Inbucket at `http://localhost:54324`.

Migrations live in `supabase/migrations/`:

1. enums, tables, constraints, indexes
2. security-definer helpers
3. RLS policies and column grants
4. RPCs
5. triggers (signup provisioning, role guard, stock audit, consistency)

Generate TypeScript types after schema changes:

```bash
npm run db:types
```

### Hosted project

1. Enable email confirmation, set the Site URL to the deployed origin, and set
   `NEXT_PUBLIC_SITE_URL` to the same value for Production only — leave it
   unset in Preview so each deployment uses its own `VERCEL_URL`.
2. Add the redirect allow-list entries for your origin: `/auth/confirm`,
   `/auth/callback`, and `/reset-password` (plus localhost during development
   and a wildcard for Vercel preview deployments).
   These are declared in `supabase/config.jsonc`. Auth emails are composed in
   this repo and posted by our own route — see [Auth email](#auth-email).
3. Apply migrations: `supabase link --project-ref "$SUPABASE_PROJECT_REF"` then
   `npm run db:push`.
4. Do **not** run `npm run seed` against production.

## Auth email

Supabase Auth still mints the tokens; the message is ours. `src/lib/email/templates.ts`
renders the HTML and text for each action, `src/app/api/auth/send-email/route.ts`
verifies the hook signature and posts over SMTP (`src/lib/email/smtp.ts`).

1. Auth → Hooks in the dashboard → **Send Email hook**, type HTTPS, URL
   `https://<your-origin>/api/auth/send-email`. Generate the secret.
2. Set `SEND_EMAIL_HOOK_SECRET` (keep the `v1,whsec_` prefix) and the `SMTP_*` /
   `EMAIL_FROM*` variables from `.env.example` in the deployment environment.
3. Gmail as the sender needs no domain: create the account, enable 2-Step
   Verification, create an app password, and use `smtp.gmail.com:587` with that
   password. Swap in Brevo or Mailtrap once a sending domain is verified — the
   route only knows SMTP host, port and credentials.

Keep the built-in templates as fallback copy: with the hook enabled Supabase
never uses them, but the dashboard still shows them when the hook is off.
Local `npm run db:start` keeps using Inbucket unless you enable the hook in
`supabase/config.jsonc`.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Start the production server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | Oxlint |
| `npm test` | Vitest unit suites |
| `npm run test:rls` | SQL RLS assertions through `psql` |
| `npm run test:e2e` | Playwright flows (local Supabase) |
| `npm run check:role-chat` | three-role check of `/api/ai/chat` against a disposable household |
| `npm run db:start` / `db:stop` / `db:reset` | Local Supabase |
| `npm run db:push` | Push migrations to the linked project |
| `npm run seed` | Local/test fixtures |

## Timezone behavior

The browser’s timezone defines the day. A small client component stores it in
the `md_tz` cookie; the server reads it for “today”, schedule windows, history
defaults, and restock-by labels. Dose occurrences are identified by wall-clock
`(scheduled_date, scheduled_time)`, and `scheduled_for` is stored as a
timestamptz for ordering/audit. Crossing timezones therefore does not move a
dose to another date in history.

## Archive vs. dispose vs. purge

- **Archive** hides a patient or medicine from active views but keeps dose logs
  and stock movements readable. Restorable from Settings.
- **Dispose** (medicines only) discards the remaining stock and archives the
  medicine in one step, recording a `disposed` ledger row. It is the action for a
  damaged supply or a record added by mistake. The inline undo restores the
  quantity read from the ledger — never from the browser — and puts the frozen
  future doses back.
- **Purge** is the typed-confirmation owner action that permanently cascades
  through medicines, dose logs, and stock adjustments.

A disposal is the only mid-week change that removes expected doses from a frozen
week (a damaged or mistaken medicine must not depress adherence), which is why
undo has to restore them. The mirror case is a medicine added mid-week: the week
froze before it existed, so `extend_week_plan()` adds its doses for the week in
progress — otherwise every dose of it is counted as off-plan. A medicine already
in the plan is never extended, so editing a schedule still cannot rewrite the
week.

## Security

- RLS is enabled on every table; policies use `security definer` helpers to
  avoid recursion.
- `households.invite_code` is protected by column-level privileges and read only
  through `get_invite_code()` for owners.
- Caregivers have no direct INSERT/UPDATE on medicines or dose logs; restocking
  and dose logging go through validated RPCs.
- A patient account reads only its own record (`can_view_patient`);
  `patients.user_id` and `patients.link_code` sit outside the column grants, so
  even a household member cannot select them.
- The assistant route checks same origin, JSON content type and a 4 KB body cap,
  screens the question (prompt injection, unrelated topics), enforces a 2-second
  cooldown plus 30 questions a day in `ai_usage`, screens the answer for
  dose-change advice, and returns `cache-control: no-store`. A failed provider
  call refunds the question.
- AI calls send the patient’s first name and medicine names to the provider —
  never an email address or account id. The assistant panel says so.
- Invite and patient link codes return one generic error and are throttled per
  user.
- The service-role key is used only by `scripts/seed.ts` and Playwright setup.

## Legacy data

The pre-rework app stored data in `localStorage`. No legacy data existed, so
**no import is provided** and the `medidose_*` keys are not read or written.

## Tests

- `src/lib/*.test.ts` — supply, schedule, dates, validation, `summary.ts`
  (week stats), `pharmacy-list.ts` (sections, ordering, one-row rule), and
  `ai/` (record serialization, guardrails: injection, off-topic, harmless vs
  unsafe advice, answer length, origin checks).
- `supabase/tests/rls.test.sql` — owner/caregiver/unlinked assertions plus a
  linked patient account: it can log its own dose, an owner cannot log at all,
  and a sibling patient's dose is refused with nothing written.
- `tests/e2e/*.spec.ts` — skip-with-reason (run from History), caregiver
  join/switch/restock/log, and caregiver edit denial (including direct REST
  calls). The three-role, summary, pharmacy and disposal flows are not in the
  E2E suite yet.
- `scripts/check-role-chat.ts` — end-to-end for `/api/ai/chat`: creates a
  disposable owner/caregiver/two-patient household, calls the route with a real
  session per role, and asserts the owner and caregiver records carry the
  household roster, the patient record carries neither the roster nor a
  sibling's medicine, a follow-up turn carries its history, and a signed-out
  request is refused. `--stub` points the app at a local echo provider, so the
  role assertions are exact and spend no AI quota. It writes to the hosted
  project only with `ALLOW_REMOTE_ROLE_CHECK=1` and deletes its fixtures.

The unit suite pins `TZ=America/New_York` for deterministic local-day tests.
RLS and E2E suites require local Supabase (Docker).

## Project structure

```text
src/app/(auth)/        login, signup, forgot/reset password
src/app/(app)/         dashboard, medicines, history, summaries, settings, join
src/app/auth/          confirm + callback route handlers
src/app/api/ai/chat/   assistant route (guarded, role-scoped conversation)
src/components/        UI primitives, app shell, doses, medicines, summaries,
                       assistant, settings
src/lib/               supply, schedule, dates, validation, data, actions
  summary.ts           frozen-week stats and slot building (pure)
  pharmacy-list.ts     restock/expiring/expired list + plain-text export (pure)
  ai/                  client, prompts, record builder, guardrails
  language.ts(-server) md_lang cookie
src/types/             domain types + database schema types
supabase/migrations/   versioned schema, RLS, RPCs, triggers
tests/e2e/             Playwright flows + fixtures
docs/                  context, requirements, migration audit, this plan
```

## Medical disclaimer

MediDose is an organizational and inventory tool. It does not prescribe
medication, diagnose conditions, or replace professional medical advice. Always
follow the instructions of a qualified healthcare professional.
