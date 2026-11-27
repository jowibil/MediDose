# MediDose: Home Medicine Management System

A web-based home medicine management system built with **Next.js (App Router)**, **Supabase**, and **Generative AI** to help older adults, household members, and caregivers organize medication schedules, monitor remaining stocks, track expiration dates, and review weekly adherence records in one place.

* **Live Deployment:** [https://medi-dose-1.vercel.app/](https://medi-dose-1.vercel.app/)
* **Repository:** [https://github.com/jowibil/MediDose](https://github.com/jowibil/MediDose)
* **Course:** IT 415 – Application Development and Emerging Technologies (Davao del Norte State College)

---

## 1. Problem Statement

Older adults and family caregivers in Panabo City who manage multiple medications often rely on memory or handwritten notes to track medicine names, dosages, remaining stock counts, expiration dates, and intake times. Without a centralized digital tool, households face higher risks of missed or mistimed doses, unexpected medication stockouts, and accidental consumption of expired medicines.

**MediDose** solves this by combining deterministic scheduling, stock-aware inventory tracking, and shelf-life alerts with a strictly non-diagnostic bilingual (English/Filipino) AI assistant grounded in the user's authorized household records.

---

## 2. Target Users & Roles

1. **Medicine Owner (Household Manager):**
   * Creates and manages the household medicine cabinet with full Create, Read, Update, and Delete (CRUD) permissions.
   * Does not log doses: the dashboard shows today's *Pending*, *Taken*, or *Skipped* status with no controls, and the owner's dose action is correcting *Taken* ↔ *Skipped* (or the skip reason) on doses already logged, from History.
   * Shares the household with Caregivers through a unique **6-character Household Invite Code**, and links a Patient account with a **6-character patient link code** issued per patient record (single use, throttled, visible only to the owner).
   * Reviews AI-generated weekly adherence summaries and manages expired medicine disposal.
2. **Caregiver:**
   * Links their account to one or more Medicine Owners using the **6-character Household Invite Code**.
   * Switches between linked patients from the top navigation bar.
   * Reads today's dose status on the dashboard — *Pending*, *Taken*, or *Skipped*, with no buttons — and logs a pending dose, corrects a logged one, or changes a skip reason from the **History** page.
   * Restocks supplies, reviews weekly summaries, and prints or copies the pharmacy restock checklist.
3. **Patient (Older Adult / Household Dependent):**
   * Redeems the owner's **patient link code** at `/join`, which binds the account to exactly one patient record — the household invite code does not grant patient access.
   * Views only their own daily intake checklist, history, and waking-hours schedule.
   * Logs their own pending doses (**Taken**, or **Skipped** with a reason) from the dashboard, which is the only surface that writes for this role; History is a read-only record, and correcting a logged dose is a caregiver's job. The bilingual AI assistant is available too.
   * Enforced by RLS, column grants, and the `log_dose` RPC — not by hiding buttons.

---

## 3. Core Features (Official System Modules)

* **1. User Authentication & 3-Role Household Linking Module:** Email/password authentication via Supabase Auth supporting three immutable roles (`owner`, `caregiver`, `patient`) — caregivers join with a 6-character household invite code, patients with a single-use per-patient link code — enforced by Postgres Row Level Security (RLS), column grants, and guarded RPCs.
* **2. Medicine Registration & Cabinet CRUD Module:** Full Create, Read, Update, and Delete (CRUD) controls in the UI for managing medicines (name, dosage, unit, daily frequency, first dose time, stock count, expiration date, treatment end date, and assigned patient) with strict validation.
* **3. Waking-Hours Dosage Scheduler & Checklist Module:** Automatically distributes daily doses evenly between `first_dose_time` and a `10:00 PM` (`22:00`) waking-hours cutoff, with strict-interval and custom-time modes. Includes an interactive daily checklist to mark doses as **Taken**, **Pending**, or **Skipped** (with quick-select reasons: *Forgot*, *Out of stock*, *Felt unwell*, *Doctor advised*), correct them afterwards, and browse a filterable history. Actions live in one place per role: an owner or a caregiver reads today's status on the dashboard and logs or corrects in History, while a patient account logs its own doses from the dashboard and sees History read-only.
* **4. Smart Inventory & Pharmacy Restock Module:** Automatically decrements stock when a dose is marked *Taken*, calculates estimated **"Days of Supply Left"** (`Math.floor(stock_on_hand / frequency_per_day)`), blocks dose logging when stock reaches `0`, supports inline restocking, and generates a printable/copyable **Pharmacy Restock Checklist** for low-stock and expired items.
* **5. Shelf-Life & Expiration Monitoring Module:** Normalizes expiration dates to local midnight to classify medicines into **Safe** (`> 30 days`), **Expiring Soon** (`0–30 days`), and **Expired** (`< 0 days`), alerting users and providing disposal for expired items — one click from the Expired column, a confirmed action in the cabinet — with a 30-second undo that restores the quantity read from the stock ledger.
* **6. AI Medicine Management Assistant Module:** A server-side Generative AI chatbot supporting English and Filipino queries grounded strictly in authorized medicine records (non-diagnostic; never prescribes or modifies records directly).
* **7. AI Weekly Summary Module:** Freezes each week's expected doses on first view, so later schedule edits cannot rewrite history, then generates a human-reviewed weekly digest summarizing adherence, taken vs. skipped doses (with logged reasons), low-stock items, and upcoming expirations. Regenerating overwrites the digest and clears the review flag.

---

## 4. Tech Stack & Architecture

* **Frontend:** Next.js (App Router), React, TypeScript, Tailwind CSS
* **Backend & Database:** Supabase (PostgreSQL, Supabase Auth, Row Level Security), Next.js Server-Side API Routes 
* **AI Integration:** Generative AI API (server-side execution only)
* **Version Control & Deployment:** Git, GitHub (`main`, `dev`, `feature/*` branching workflow), Vercel

---

## 5. Database & Data Model

MediDose uses a relational **PostgreSQL** database hosted on **Supabase** with **Row Level Security (RLS)** enabled across all tables to enforce permissions across **Medicine Owners**, **Caregivers**, and **Patients**.

| Table Name | Key Columns & Foreign Keys | Description |
| :--- | :--- | :--- |
| `**profiles**` | id (PK, FK to auth.users.id), display_name | App-level user record. The role lives in household_members, not here. |
| `**households**` | id (PK), name, invite_code (unique), created_by (FK to profiles.id) | One family sharing medicines. invite_code is outside the column grants and readable only through get_invite_code() by the owner. |
| `**household_members**` | (household_id, user_id) PK, role (owner / caregiver / patient) | Membership and role. Partial unique indexes keep one owner per household, one owned household per user, and one patient account per patient record. |
| `**patients**` | id (PK), household_id (FK), name, archived_at, user_id (FK, unique), link_code (unique) | The people being cared for. user_id is the linked patient account; both it and link_code are outside the column grants. |
| `**medicines**` | id (PK), patient_id (FK), name, dosage, frequency_per_day (1-6), schedule_mode, first_dose_time, custom_times, schedule_times[], stock_on_hand, expiration_date, treatment_end_date, archived_at | A prescription: schedule inputs, the generated slots, stock, and shelf life. |
| `**dose_logs**` | id (PK), medicine_id (FK), patient_id (FK), scheduled_date, scheduled_time, scheduled_for, status, skip_reason, skip_note, logged_by, last_modified_by | One row per logged dose. Pending is derived; identity is (medicine_id, scheduled_date, scheduled_time). |
| `**stock_adjustments**` | id (PK), medicine_id (FK), actor (FK), dose_log_id (FK), reason, delta | Audit ledger: initial, dose_taken, dose_reverted, restock, owner_edit, disposed, dispose_reverted. |
| `**week_plans**` | (patient_id, week_start) PK, timezone | A frozen week, written once so later schedule edits cannot rewrite it; a medicine started mid-week is added once by extend_week_plan(). |
| `**expected_doses**` | week_plan_id (FK), patient_id (FK), medicine_id (FK, set null), medicine_name, scheduled_date, scheduled_time | The frozen slots of that week; medicine_id nulls on purge so a deleted medicine cannot shrink a past week. |
| `**weekly_summaries**` | (patient_id, week_start) PK, household_id (FK), counters, summary_en, summary_fil, model, generated_by, is_reviewed, reviewed_by, removed_midweek | Counters and prose together, so a summary is explainable from its own row; regenerate overwrites and clears the review. |
| `**ai_usage**` | (user_id, day) PK, count, last_request_at | Assistant daily quota and burst cooldown, writable only through begin_ai_request / refund_ai_request. |
| `**join_attempts**` | user_id (FK), attempted_at | Throttles invite-code and patient-link-code guessing. |

---

## 6. Environment Variables

Create a `.env.local` file in the root directory and configure the following variables before running the application:

```env
# Supabase (browser-safe)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_public_key

# Public origin for auth email links (Production only; leave unset in Preview)
NEXT_PUBLIC_SITE_URL=https://your-deployment.vercel.app

# Server-side Generative AI (never NEXT_PUBLIC_). Read lazily: with no key the
# summary and the assistant report a plain “unavailable” line instead of
# failing a page (the missing variable is logged server-side only).
AI_API_KEY=your_generative_ai_api_key
AI_API_BASE=https://generativelanguage.googleapis.com/v1beta/openai
AI_MODEL=gemini-3.6-flash

# Auth email: Supabase Send Email Hook + SMTP sender (server-only secrets)
SEND_EMAIL_HOOK_SECRET=v1,whsec_your_hook_secret
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_sender@gmail.com
SMTP_PASSWORD=your_app_password
EMAIL_FROM=your_sender@gmail.com
EMAIL_FROM_NAME=MediDose
```

`SUPABASE_SERVICE_ROLE_KEY` is for local seeding and tests only and is never
imported into `src/`. `.env.local` is gitignored; `.env.example` is the
complete reference.
