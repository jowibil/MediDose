-- Enums, tables, constraints, and indexes for the MediDose rework.
create type public.household_role as enum ('owner', 'caregiver');
create type public.dose_status as enum ('pending', 'taken', 'skipped');
create type public.skip_reason as enum ('forgot', 'out_of_stock', 'felt_unwell', 'doctor_advised');
create type public.dosage_unit as enum ('mg', 'ml');
create type public.schedule_mode as enum ('waking_hours', 'strict_interval', 'custom');
create type public.stock_change_reason as enum ('initial', 'dose_taken', 'dose_reverted', 'restock', 'owner_edit');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  invite_code text not null unique check (invite_code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.household_role not null,
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create unique index household_members_one_owner_per_household
  on public.household_members (household_id) where role = 'owner';
create unique index household_members_one_owned_household_per_user
  on public.household_members (user_id) where role = 'owner';
create index household_members_user_idx on public.household_members (user_id);

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index patients_household_idx on public.patients (household_id);
create index patients_active_idx on public.patients (household_id) where archived_at is null;

create table public.medicines (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  dosage_amount numeric(10, 2) not null check (dosage_amount > 0),
  dosage_unit public.dosage_unit not null default 'mg',
  frequency_per_day integer not null check (frequency_per_day between 1 and 6),
  schedule_mode public.schedule_mode not null default 'waking_hours',
  first_dose_time time not null default '08:00',
  custom_times time[],
  schedule_times time[] not null,
  stock_on_hand integer not null default 0 check (stock_on_hand >= 0),
  expiration_date date not null,
  treatment_end_date date,
  archived_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint medicines_schedule_length
    check (coalesce(array_length(schedule_times, 1), 0) = frequency_per_day),
  constraint medicines_custom_times_length
    check (
      schedule_mode <> 'custom'
      or (custom_times is not null and array_length(custom_times, 1) = frequency_per_day)
    )
);

create index medicines_patient_idx on public.medicines (patient_id);
create index medicines_active_idx on public.medicines (patient_id) where archived_at is null;

create table public.dose_logs (
  id uuid primary key default gen_random_uuid(),
  medicine_id uuid not null references public.medicines (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  scheduled_date date not null,
  scheduled_time time not null,
  scheduled_for timestamptz not null,
  timezone text not null default 'UTC',
  status public.dose_status not null check (status <> 'pending'),
  skip_reason public.skip_reason,
  skip_note text check (skip_note is null or length(skip_note) <= 500),
  logged_by uuid references public.profiles (id) on delete set null,
  logged_at timestamptz not null default now(),
  last_modified_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint dose_logs_unique_occurrence unique (medicine_id, scheduled_date, scheduled_time),
  constraint dose_logs_status_fields check (
    (status = 'taken' and skip_reason is null and skip_note is null)
    or (status = 'skipped' and skip_reason is not null)
  )
);

create index dose_logs_patient_date_idx
  on public.dose_logs (patient_id, scheduled_date desc);
create index dose_logs_status_reason_idx on public.dose_logs (status, skip_reason);

create table public.stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  medicine_id uuid not null references public.medicines (id) on delete cascade,
  delta integer not null check (delta <> 0),
  reason public.stock_change_reason not null,
  actor uuid references public.profiles (id) on delete set null,
  dose_log_id uuid references public.dose_logs (id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create index stock_adjustments_medicine_idx
  on public.stock_adjustments (medicine_id, created_at desc);

create table public.join_attempts (
  id bigserial primary key,
  user_id uuid references public.profiles (id) on delete cascade,
  succeeded boolean not null,
  attempted_at timestamptz not null default now()
);

create index join_attempts_user_idx
  on public.join_attempts (user_id, attempted_at desc);
