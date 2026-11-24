# MediDose

> Precision Medicine, Trusted Care.

MediDose is a household medication tracker: schedules, stock, expiration dates,
dose history, and caregiver access. It runs on **Next.js (App Router,
TypeScript)** with **Supabase** (Postgres, Auth, Row Level Security).

## Features

- **Smart schedules** — waking-hours distribution (first dose → 10:00 PM),
  strict `24 / frequency` intervals, and custom times.
- **Skipped-dose reasons** — Pending / Taken / Skipped, with exactly one of
  Forgot, Out of stock, Felt unwell, or Doctor advised, plus an optional
  500-character note. Reasons are filterable in history.
- **Days of supply** — one pure function (`src/lib/supply.ts`) drives every
  badge: “~2 days left — Restock by Thursday”, red at 0–2 days, amber at 3–7,
  neutral above 7, and “Less than 1 day left” when stock is positive but under
  one day.
- **Caregiver households** — owners create a household with a six-character
  invite code; caregivers join and see a grouped, single-patient top-bar
  selector. Owners manage patients and medicines; caregivers log doses and
  restock.
- **Audited stock** — every delta (initial, dose taken, reverted, restock,
  owner edit) is recorded in `stock_adjustments`.
- **Expiration board** — Safe / Expiring soon (≤30 days) / Expired, with
  archive instead of silent deletion.

## Role model

| Capability | Owner | Caregiver |
| --- | --- | --- |
| View patients, medicines, doses, ledger | Own household | Linked households |
| Create/edit/archive/purge patients & medicines | Yes | No |
| Log Taken/Skipped and correct Taken ↔ Skipped | Yes | Yes |
| Restock | Yes | Yes |
| View/regenerate invite code, rename household, remove caregivers | Yes | No |
| Join another household | No (fixed role) | Yes, many |

Roles are chosen at signup and cannot change. An owner has exactly one
household and can never join another. Enforced in the database, not just the UI.

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
  in Vercel for **Production and Preview**; unset it locally to fall back to
  the request headers and `http://localhost:3000`.
- `SUPABASE_SERVICE_ROLE_KEY` — **server/tests only**; never imported into
  `src/`. If your project uses Supabase’s newer publishable/secret key naming,
  map them to these variables.
- `DATABASE_URL` — local Postgres for `npm run test:rls`.

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
   `NEXT_PUBLIC_SITE_URL` to the same value for Production and Preview.
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

## Archive vs. purge

Archiving a patient or medicine hides it from active views but keeps dose logs
and stock movements readable. Owners can restore from Settings, or purge with a
typed confirmation — purge permanently cascades through medicines, dose logs,
and stock adjustments.

## Security

- RLS is enabled on every table; policies use `security definer` helpers to
  avoid recursion.
- `households.invite_code` is protected by column-level privileges and read only
  through `get_invite_code()` for owners.
- Caregivers have no direct INSERT/UPDATE on medicines or dose logs; restocking
  and dose logging go through validated RPCs.
- Invite joins return one generic error and are throttled at five failures per
  hour per user.
- The service-role key is used only by `scripts/seed.ts` and Playwright setup.

## Legacy data

The pre-rework app stored data in `localStorage`. No legacy data existed, so
**no import is provided** and the `medidose_*` keys are not read or written.

## Tests

- `src/lib/*.test.ts` — supply, schedule, dates, validation.
- `supabase/tests/rls.test.sql` — 20+ owner/caregiver/unlinked assertions.
- `tests/e2e/*.spec.ts` — skip-with-reason, caregiver join/switch/restock, and
  caregiver edit denial (including direct REST calls).

The unit suite pins `TZ=America/New_York` for deterministic local-day tests.
RLS and E2E suites require local Supabase (Docker).

## Project structure

```text
src/app/(auth)/        login, signup, forgot/reset password
src/app/(app)/         dashboard, medicines, history, settings, join
src/app/auth/          confirm + callback route handlers
src/components/        UI primitives, app shell, doses, medicines, settings
src/lib/               supply, schedule, dates, validation, data, actions
src/types/             domain types + database schema types
supabase/migrations/   versioned schema, RLS, RPCs, triggers
supabase/tests/        SQL RLS proof suite
tests/e2e/             Playwright flows + fixtures
docs/migration-audit.md
```

## Medical disclaimer

MediDose is an organizational and inventory tool. It does not prescribe
medication, diagnose conditions, or replace professional medical advice. Always
follow the instructions of a qualified healthcare professional.
