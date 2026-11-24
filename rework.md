# Role
You are a senior full-stack engineer. You are reworking an existing medication-tracking web app. It currently runs entirely in the browser and stores everything in `localStorage`. Migrate it to **Next.js (App Router, TypeScript)** with **Supabase** (Postgres, Auth, Row Level Security), and add the three features described below.

# Ground rules
- This is a rework, not a greenfield build. **Before changing anything, read the existing codebase** and write a short audit: current pages and components, the shape of the data stored in localStorage, existing business logic, and anything worth keeping (UI, copy, styling). Reuse existing UI and logic wherever possible.
- Work in the four phases below, in order. After each phase, stop and summarize what changed, how to run it, and any decisions I need to make. Do not start the next phase until the current one runs cleanly (`npm run build` and typecheck pass).
- Never trust the client for authorization. Every permission rule must be enforced by Postgres RLS, not just hidden in the UI.
- Store all secrets in `.env.local`, and provide `.env.example`. Never use the service-role key in client code.
- Keep migrations as versioned SQL files in `supabase/migrations/`. Do not make dashboard-only changes.

# Features to deliver

## 1. Missed-dose reason logging
- Dose status expands from the current values to **Pending, Taken, Skipped**.
- When a dose is marked Skipped, show quick-select tags: **Forgot, Out of stock, Felt unwell, Doctor advised**. Allow exactly one tag, with an optional free-text note.
- Skipped doses must store the reason. Taken and Pending doses must not.
- Show the skip reason in the dose history and make it filterable.

## 2. Smart "Days of Supply Left"
- `daysRemaining = Math.floor(stock_on_hand / frequency_per_day)`. Guard against `frequency_per_day <= 0`.
- Display a badge on each medicine, e.g. "~2 days left — Restock by Thursday". The restock-by day is today + daysRemaining, shown as a weekday name (or a date if more than 6 days away).
- Color-code the badge: red at 0-2 days, amber at 3-7, neutral above 7. A medicine at 0 days shows "Out of stock".
- Put this calculation in one pure, unit-tested function (e.g. `lib/supply.ts`) and reuse it everywhere.
- Logging a dose as Taken decrements `stock_on_hand`. Skipped does not.

## 3. Caregiver invite and multi-patient household linking
- On signup, a Medicine Owner automatically gets a household and a unique **6-character Household Invite Code** (uppercase alphanumeric, excluding look-alikes such as 0/O and 1/I). Owners can regenerate the code.
- A Caregiver signs up or logs in, then enters the code to link their account to that household.
- A caregiver in one or more households sees a **top-bar patient selector** to switch between linked patients. The selected patient scopes every page.
- Permissions:
  - **Owner:** full CRUD on medicines, patients, schedules, and household settings.
  - **Caregiver:** view schedules, log doses as Taken or Skipped, and restock supplies. A caregiver cannot create, edit, or delete medicines or household settings.
- All of this is enforced by RLS.

# Phases

## Phase 1: Project and page scaffolding
- Initialize Next.js (App Router, TypeScript, Tailwind if the existing app uses a CSS approach that maps to it; otherwise keep the existing styling approach).
- Install and configure `@supabase/ssr` with separate browser and server clients and auth-refreshing middleware.
- Create the route structure: `/login`, `/signup`, `/join` (enter invite code), `/dashboard`, `/medicines`, `/history`, `/settings`. Protect everything except login and signup through middleware.
- Build the app shell: top bar with patient selector placeholder, user menu, and sign-out.
- Deliverable: app boots, auth pages render, protected routes redirect correctly, and the audit document is committed as `docs/migration-audit.md`.

## Phase 2: Backend and database (Supabase)
Design the schema, with migrations. Suggested tables (adjust after your audit):
- `profiles` (id → auth.users, display_name)
- `households` (id, name, invite_code unique, created_by)
- `household_members` (household_id, user_id, role: 'owner' | 'caregiver', unique per pair)
- `patients` (id, household_id, name)
- `medicines` (id, patient_id, name, dosage, frequency_per_day, schedule_times, stock_on_hand, created_at)
- `dose_logs` (id, medicine_id, patient_id, scheduled_for, status: pending|taken|skipped, skip_reason enum nullable, skip_note, logged_by, logged_at)

Requirements:
- Enable RLS on every table. Write policies using a `security definer` helper such as `is_household_member(household_id)` and `household_role(household_id)` to avoid recursive policies.
- Owners: full CRUD on medicines, patients, and household data.
- Caregivers: SELECT on medicines, patients, and dose_logs in their households. INSERT and UPDATE on dose_logs only. Caregivers must not be able to change any medicine field except stock.
- Because RLS cannot restrict individual columns, implement restocking through a `security definer` RPC (e.g. `restock_medicine(medicine_id, quantity)`) that verifies membership, and likewise a `log_dose(...)` RPC that atomically records the dose and decrements stock. Caregivers have no direct UPDATE on `medicines`.
- A caregiver cannot read `households` before joining, so joining goes through a `join_household(code)` RPC that validates the code, inserts a caregiver membership, and is rate-limit-friendly (no code enumeration via error messages).
- A trigger creates a profile, household, owner membership, and invite code on signup.
- CHECK constraint: skip_reason must be non-null when status = 'skipped' and null otherwise.
- Provide seed data and a short **RLS test script** (SQL or pgTAP) that proves: an owner can edit medicines, a caregiver cannot, a caregiver sees only their linked households, and an unlinked user sees nothing.
- Generate TypeScript types from the schema.

## Phase 3: Frontend implementation
- Replace every localStorage read/write with Supabase queries via server components, server actions, or route handlers. Keep the UI and components from the existing app where you can.
- Implement the top-bar patient selector (persist the selection in a cookie, scope all queries to it).
- Medicines page: owners see add/edit/delete. Caregivers see read-only cards with a Restock action.
- Dashboard: today's doses with Pending/Taken/Skipped controls. Skipped opens the quick-select tag picker (Forgot, Out of stock, Felt unwell, Doctor advised) with an optional note.
- Days-of-supply badge on every medicine card and on the dashboard, using the shared pure function.
- Settings (owner only): view and copy the invite code, regenerate it, and list or remove caregivers.
- `/join` page: 6-character code input with clear error and success states.
- Handle loading, empty, and error states. Make it responsive and keyboard accessible.

## Phase 4: Debugging, refactoring, and migration
- Write a one-time **localStorage import**: on first login, if legacy localStorage data exists, offer to import it into the user's household, mapping old fields to the new schema, with no duplicates on re-run. Then offer to clear the old data.
- Remove dead localStorage code and unused dependencies.
- Consolidate duplicated logic (dose logging, supply calculation, role checks) into shared modules.
- Add tests: unit tests for the supply calculation (including 0 stock, frequency larger than stock, and invalid frequency), and integration or e2e tests for the three core flows (skip with reason, caregiver join and switch patient, caregiver blocked from editing a medicine).
- Fix any bugs you find along the way and list them in the final summary.
- Final deliverable: updated README (setup, env vars, running migrations, role model), and a checklist confirming every feature above works end to end.

# Definition of done
- No `localStorage` usage remains for app data (UI preferences excepted).
- `npm run build`, typecheck, lint, and tests all pass.
- RLS tests prove the owner/caregiver permission boundaries at the database level.
- All three features work as specified, with a caregiver able to link via code, switch patients, log doses with skip reasons, and restock, but not edit medicines.

# If something is ambiguous
Make a sensible default, note it in the phase summary, and continue. Only stop to ask if a choice would be hard to reverse (for example, dropping existing data or changing the auth model).