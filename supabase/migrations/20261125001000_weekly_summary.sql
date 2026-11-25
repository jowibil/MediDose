-- WP2 — weekly summary with a frozen week (docs/three-role-ai-plan.md §6).
--
-- Pending doses are derived from the medicine's *current* schedule, so editing a
-- frequency or archiving a medicine rewrites history. Freezing the week stores
-- the denominator once; every later figure is computed against that fact.
--
-- Writes never go through PostgREST here: the three tables are select-only for
-- authenticated staff, and the RPCs below (security definer) are the only write
-- path. `revoke all` first also removes Supabase's default grants on new tables.

-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------

-- One stable timezone per household, so the week boundary cannot depend on
-- whichever member happened to visit first.
alter table public.households add column timezone text;

create table public.week_plans (
  patient_id uuid not null references public.patients (id) on delete cascade,
  week_start date not null,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  primary key (patient_id, week_start)
);

create table public.expected_doses (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  week_start date not null,
  medicine_id uuid references public.medicines (id) on delete set null,
  medicine_name text not null,
  scheduled_date date not null,
  scheduled_time time not null,
  unique (patient_id, week_start, medicine_id, scheduled_date, scheduled_time)
);

create index expected_doses_week_idx
  on public.expected_doses (patient_id, week_start);

create table public.weekly_summaries (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  week_start date not null,
  week_end date not null,
  timezone text not null default 'UTC',
  plan_tracked boolean not null default false,
  expected_count integer not null default 0,
  taken_count integer not null default 0,
  skipped_count integer not null default 0,
  unscheduled_count integer not null default 0,
  adherence_rate numeric(5, 2),
  skipped_by_reason jsonb not null default '{}'::jsonb,
  low_stock jsonb not null default '[]'::jsonb,
  expiring jsonb not null default '[]'::jsonb,
  removed_midweek jsonb not null default '[]'::jsonb,
  summary_en text,
  summary_fil text,
  model text,
  generated_by uuid references public.profiles (id) on delete set null,
  generated_at timestamptz not null default now(),
  is_reviewed boolean not null default false,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  unique (patient_id, week_start)
);

-- ---------------------------------------------------------------------------
-- 2. RLS and grants: staff read, nobody writes directly
-- ---------------------------------------------------------------------------

alter table public.week_plans enable row level security;
alter table public.expected_doses enable row level security;
alter table public.weekly_summaries enable row level security;

revoke all on public.week_plans from anon, authenticated;
revoke all on public.expected_doses from anon, authenticated;
revoke all on public.weekly_summaries from anon, authenticated;

grant select on public.week_plans to authenticated;
grant select on public.expected_doses to authenticated;
grant select on public.weekly_summaries to authenticated;

create policy week_plans_select on public.week_plans
  for select to authenticated
  using (public.is_household_staff(public.patient_household(patient_id)));

create policy expected_doses_select on public.expected_doses
  for select to authenticated
  using (public.is_household_staff(public.patient_household(patient_id)));

create policy weekly_summaries_select on public.weekly_summaries
  for select to authenticated
  using (public.is_household_staff(household_id));

-- ---------------------------------------------------------------------------
-- 3. freeze_week — one transaction, one plan row, validated slots
-- ---------------------------------------------------------------------------

-- p_slots is client-shaped input even though a server action builds it: every
-- row is re-checked against the medicine's real schedule, and anything that
-- fails is dropped rather than trusted.
create or replace function public.freeze_week(
  p_patient_id uuid,
  p_week_start date,
  p_timezone text,
  p_slots jsonb
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_household uuid;
  v_stored_tz text;
  v_tz text;
  v_this_week date;
  v_created uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select household_id into v_household
  from public.patients
  where id = p_patient_id;

  if v_household is null then
    raise exception 'NOT_FOUND';
  end if;

  -- Staff and the patient themself: the dashboard freezes the current week on
  -- every visit, for every role, from that patient's own schedule.
  if not public.can_view_patient(p_patient_id) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  v_tz := coalesce(nullif(btrim(p_timezone), ''), 'UTC');
  if not exists (
    select 1 from pg_catalog.pg_timezone_names where name = v_tz
  ) then
    v_tz := 'UTC';
  end if;

  select timezone into v_stored_tz from public.households where id = v_household;
  if v_stored_tz is null or v_stored_tz = '' then
    update public.households set timezone = v_tz where id = v_household;
  else
    v_tz := v_stored_tz;
  end if;

  v_this_week := date_trunc('week', (now() at time zone v_tz))::date;

  -- Monday only, and within a day of the household's current week: a past week
  -- must not be frozen late from today's schedule.
  if extract(isodow from p_week_start) <> 1 then
    raise exception 'INVALID_WEEK';
  end if;
  if p_week_start < v_this_week - 1 or p_week_start > v_this_week + 1 then
    raise exception 'OUT_OF_WINDOW';
  end if;

  insert into public.week_plans (patient_id, week_start, timezone)
  values (p_patient_id, p_week_start, v_tz)
  on conflict (patient_id, week_start) do nothing
  returning patient_id into v_created;

  -- Already frozen: the week is a fact now, so slots are never re-derived.
  if v_created is null then
    return false;
  end if;

  with raw as (
    select *
    from jsonb_to_recordset(coalesce(p_slots, '[]'::jsonb))
      as s(medicine_id uuid, medicine_name text, date text, time text)
    where s.date ~ '^\d{4}-\d{2}-\d{2}$'
      and s.time ~ '^\d{2}:\d{2}(:\d{2})?$'
  )
  insert into public.expected_doses (
    patient_id,
    week_start,
    medicine_id,
    medicine_name,
    scheduled_date,
    scheduled_time
  )
  select
    p_patient_id,
    p_week_start,
    m.id,
    m.name,
    raw.date::date,
    raw.time::time
  from raw
  join public.medicines m
    on m.id = raw.medicine_id
   and m.patient_id = p_patient_id
  where raw.date::date between p_week_start and p_week_start + 6
    and raw.time::time = any (m.schedule_times)
  on conflict do nothing;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. remove_future_expected — the one subtractive exception
-- ---------------------------------------------------------------------------

-- Archiving a medicine mid-week drops its *future* slots: a finished
-- prescription must not depress adherence for doses nobody could take. Past
-- rows are never touched.
create or replace function public.remove_future_expected(
  p_medicine_id uuid,
  p_today date
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_medicine public.medicines%rowtype;
  v_removed integer;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into v_medicine
  from public.medicines
  where id = p_medicine_id;

  if not found then
    raise exception 'NOT_FOUND';
  end if;

  if not public.is_household_staff(
    public.patient_household(v_medicine.patient_id)
  ) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  delete from public.expected_doses
  where medicine_id = p_medicine_id
    and scheduled_date > p_today;

  get diagnostics v_removed = row_count;

  if v_removed > 0 then
    update public.weekly_summaries
    set removed_midweek = removed_midweek || jsonb_build_array(
      jsonb_build_object(
        'medicine_name', v_medicine.name,
        'count', v_removed,
        'removed_on', p_today
      )
    )
    where patient_id = v_medicine.patient_id
      and p_today between week_start and week_end;
  end if;

  return v_removed;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. save_weekly_summary — regenerate is an overwrite, never a revision
-- ---------------------------------------------------------------------------

create or replace function public.save_weekly_summary(
  p_patient_id uuid,
  p_week_start date,
  p_payload jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_household uuid;
  v_week_end date;
  v_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select household_id into v_household
  from public.patients
  where id = p_patient_id;

  if v_household is null then
    raise exception 'NOT_FOUND';
  end if;

  if not public.is_household_staff(v_household) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  if p_week_start > date_trunc('week', now())::date + 1 then
    raise exception 'OUT_OF_WINDOW';
  end if;

  v_week_end := coalesce(
    nullif(p_payload->>'week_end', '')::date,
    p_week_start + 6
  );

  insert into public.weekly_summaries (
    patient_id,
    household_id,
    week_start,
    week_end,
    timezone,
    plan_tracked,
    expected_count,
    taken_count,
    skipped_count,
    unscheduled_count,
    adherence_rate,
    skipped_by_reason,
    low_stock,
    expiring,
    removed_midweek,
    summary_en,
    summary_fil,
    model,
    generated_by,
    generated_at,
    is_reviewed,
    reviewed_by,
    reviewed_at
  )
  values (
    p_patient_id,
    v_household,
    p_week_start,
    v_week_end,
    coalesce(nullif(p_payload->>'timezone', ''), 'UTC'),
    coalesce((p_payload->>'plan_tracked')::boolean, false),
    coalesce((p_payload->>'expected_count')::integer, 0),
    coalesce((p_payload->>'taken_count')::integer, 0),
    coalesce((p_payload->>'skipped_count')::integer, 0),
    coalesce((p_payload->>'unscheduled_count')::integer, 0),
    nullif(p_payload->>'adherence_rate', '')::numeric,
    coalesce(p_payload->'skipped_by_reason', '{}'::jsonb),
    coalesce(p_payload->'low_stock', '[]'::jsonb),
    coalesce(p_payload->'expiring', '[]'::jsonb),
    coalesce(p_payload->'removed_midweek', '[]'::jsonb),
    p_payload->>'summary_en',
    p_payload->>'summary_fil',
    p_payload->>'model',
    (select auth.uid()),
    now(),
    false,
    null,
    null
  )
  on conflict (patient_id, week_start) do update set
    week_end = excluded.week_end,
    timezone = excluded.timezone,
    plan_tracked = excluded.plan_tracked,
    expected_count = excluded.expected_count,
    taken_count = excluded.taken_count,
    skipped_count = excluded.skipped_count,
    unscheduled_count = excluded.unscheduled_count,
    adherence_rate = excluded.adherence_rate,
    skipped_by_reason = excluded.skipped_by_reason,
    low_stock = excluded.low_stock,
    expiring = excluded.expiring,
    removed_midweek = excluded.removed_midweek,
    summary_en = excluded.summary_en,
    summary_fil = excluded.summary_fil,
    model = excluded.model,
    generated_by = excluded.generated_by,
    generated_at = now(),
    is_reviewed = false,
    reviewed_by = null,
    reviewed_at = null
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. set_summary_reviewed — the human-review flag
-- ---------------------------------------------------------------------------

create or replace function public.set_summary_reviewed(
  p_summary_id uuid,
  p_reviewed boolean
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_household uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select household_id into v_household
  from public.weekly_summaries
  where id = p_summary_id;

  if v_household is null then
    raise exception 'NOT_FOUND';
  end if;

  if not public.is_household_staff(v_household) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  update public.weekly_summaries
  set is_reviewed = p_reviewed,
      reviewed_by = case when p_reviewed then (select auth.uid()) else null end,
      reviewed_at = case when p_reviewed then now() else null end
  where id = p_summary_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Privileges
-- ---------------------------------------------------------------------------

revoke all on function public.freeze_week(uuid, date, text, jsonb) from public, anon;
revoke all on function public.remove_future_expected(uuid, date) from public, anon;
revoke all on function public.save_weekly_summary(uuid, date, jsonb) from public, anon;
revoke all on function public.set_summary_reviewed(uuid, boolean) from public, anon;

grant execute on function public.freeze_week(uuid, date, text, jsonb) to authenticated;
grant execute on function public.remove_future_expected(uuid, date) to authenticated;
grant execute on function public.save_weekly_summary(uuid, date, jsonb) to authenticated;
grant execute on function public.set_summary_reviewed(uuid, boolean) to authenticated;
