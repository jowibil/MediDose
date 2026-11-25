-- WP1 — the patient role: account linking, scoped RLS, and the staff/patient
-- split on the dose and stock RPCs (docs/three-role-ai-plan.md §5).
--
-- Requires 20261125000600_enum_values.sql to be applied first. This file uses
-- the 'patient' enum label, which Postgres cannot use in the transaction that
-- adds it.
--
-- DEPLOYMENT COUPLING — read before pushing:
-- this file revokes the table-level SELECT on public.patients. The shipped
-- getPatients() and getArchivedPatients() in src/lib/data.ts use `.select("*")`,
-- which requires that table-level grant, so they fail with "permission denied
-- for table patients" until they list columns explicitly. Ship that
-- application change (it is a no-op against the old schema) in the same window
-- as this migration, or Settings returns 500.
--
-- No tables are created here. Column privileges are what keep
-- patients.link_code and patients.user_id unreadable; the RLS policies only
-- decide which rows are visible.

-- ---------------------------------------------------------------------------
-- 1. Patient ↔ account link
-- ---------------------------------------------------------------------------

-- Nullable on purpose: a dependent who never logs in is still a valid patient,
-- and an unclaimed code can be regenerated.
alter table public.patients
  add column user_id uuid unique references public.profiles (id) on delete set null;

alter table public.patients
  add column link_code text unique
    check (link_code ~ '^[A-HJ-NP-Z2-9]{6}$');

-- One patient account per household record is enforced by user_id unique above;
-- one household per patient account by this partial index.
create unique index household_members_one_patient_account
  on public.household_members (user_id) where role = 'patient';

-- ---------------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------------

-- Staff keep the household-wide read they have today. A patient-role member does
-- not qualify, which is the whole point of the split.
create or replace function public.is_household_staff(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members hm
    where hm.household_id = hid
      and hm.user_id = (select auth.uid())
      and hm.role in ('owner', 'caregiver')
  );
$$;

-- The only predicate medicines, dose_logs and the assistant may use: staff see
-- the whole household, a patient sees only the record bound to their account.
create or replace function public.can_view_patient(pid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.patients p
    where p.id = pid
      and (
        p.user_id = (select auth.uid())
        or public.is_household_staff(p.household_id)
      )
  );
$$;

create or replace function public.can_view_medicine(mid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.medicines m
    where m.id = mid
      and public.can_view_patient(m.patient_id)
  );
$$;

-- The caller's own patient record, if any. Used by the app to resolve a patient
-- session without trusting the md_active_patient cookie.
create or replace function public.self_patient_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.patients p
  where p.user_id = (select auth.uid())
  limit 1;
$$;

revoke all on function public.is_household_staff(uuid) from public, anon;
revoke all on function public.can_view_patient(uuid) from public, anon;
revoke all on function public.can_view_medicine(uuid) from public, anon;
revoke all on function public.self_patient_id() from public, anon;

grant execute on function public.is_household_staff(uuid) to authenticated;
grant execute on function public.can_view_patient(uuid) to authenticated;
grant execute on function public.can_view_medicine(uuid) to authenticated;
grant execute on function public.self_patient_id() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. One code space for households.invite_code and patients.link_code
-- ---------------------------------------------------------------------------

-- Same generator, now unique across both tables so a code is never ambiguous
-- about what it claims.
create or replace function public.generate_invite_code()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text;
  i integer;
begin
  loop
    result := '';
    for i in 1..6 loop
      result := result || substr(
        alphabet,
        1 + (get_byte(extensions.gen_random_bytes(1), 0) % 32),
        1
      );
    end loop;
    exit when not exists (
      select 1 from public.households h where h.invite_code = result
    ) and not exists (
      select 1 from public.patients p where p.link_code = result
    );
  end loop;
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Column privileges on patients
-- ---------------------------------------------------------------------------

-- A policy decides rows, a grant decides columns. Only the RPCs below may write
-- or read user_id / link_code, which is the same pattern households.invite_code
-- already uses.
revoke select, insert, update on public.patients from authenticated;

grant select (id, household_id, name, archived_at, created_at, updated_at)
  on public.patients to authenticated;
grant insert (household_id, name, archived_at, updated_at)
  on public.patients to authenticated;
grant update (name, archived_at, updated_at)
  on public.patients to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Row policies: household-wide for staff, own record for a patient
-- ---------------------------------------------------------------------------

drop policy if exists patients_select on public.patients;
create policy patients_select on public.patients
  for select to authenticated
  using (public.can_view_patient(id));

drop policy if exists medicines_select on public.medicines;
create policy medicines_select on public.medicines
  for select to authenticated
  using (public.can_view_patient(patient_id));

drop policy if exists dose_logs_select on public.dose_logs;
create policy dose_logs_select on public.dose_logs
  for select to authenticated
  using (public.can_view_patient(patient_id));

drop policy if exists stock_adjustments_select on public.stock_adjustments;
create policy stock_adjustments_select on public.stock_adjustments
  for select to authenticated
  using (public.can_view_medicine(medicine_id));

-- Removing a patient membership goes through unlink_patient() (security
-- definer); no DELETE policy is added for it. household_members_delete_caregiver
-- is unchanged.

-- ---------------------------------------------------------------------------
-- 6. Link-code RPCs
-- ---------------------------------------------------------------------------

-- Owner only. Mints a code for an unlinked, unarchived patient and returns it.
-- Calling again overwrites the previous code, which revokes a leaked one.
create or replace function public.set_patient_link_code(p_patient_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_patient public.patients%rowtype;
  v_code text;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into v_patient
  from public.patients
  where id = p_patient_id
  for update;

  if not found then
    raise exception 'NOT_FOUND';
  end if;

  if not public.is_household_owner(v_patient.household_id) then
    raise exception 'NOT_OWNER';
  end if;

  if v_patient.archived_at is not null or v_patient.user_id is not null then
    raise exception 'PATIENT_NOT_LINKABLE';
  end if;

  v_code := public.generate_invite_code();

  update public.patients
  set link_code = v_code
  where id = p_patient_id;

  return v_code;
end;
$$;

-- The only read path for the column. Null means "no code minted right now".
create or replace function public.get_patient_link_code(p_patient_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_patient public.patients%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into v_patient from public.patients where id = p_patient_id;

  if not found then
    raise exception 'NOT_FOUND';
  end if;

  if not public.is_household_owner(v_patient.household_id) then
    raise exception 'NOT_OWNER';
  end if;

  return v_patient.link_code;
end;
$$;

-- Redeems a code as the signed-in patient. Mirrors join_household: failures log
-- an attempt and return NULL so the throttle row commits, instead of raising and
-- rolling the log back. One generic outcome for every failure, so codes cannot
-- be probed.
create or replace function public.claim_patient(p_code text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_code text;
  v_patient public.patients%rowtype;
  v_failures integer;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  -- Roles are fixed: a caregiver or owner can never claim a patient record.
  if exists (
    select 1 from public.household_members
    where user_id = v_uid and role <> 'patient'
  ) then
    raise exception 'ROLE_FIXED';
  end if;

  -- One patient account per user.
  if exists (
    select 1 from public.household_members
    where user_id = v_uid and role = 'patient'
  ) then
    raise exception 'PATIENT_ALREADY_LINKED';
  end if;

  select count(*) into v_failures
  from public.join_attempts
  where user_id = v_uid
    and succeeded = false
    and attempted_at > now() - interval '1 hour';

  if v_failures >= 5 then
    insert into public.join_attempts (user_id, succeeded) values (v_uid, false);
    perform pg_sleep(0.2);
    return null;
  end if;

  v_code := upper(regexp_replace(coalesce(p_code, ''), '[[:space:]-]', '', 'g'));

  select * into v_patient
  from public.patients
  where link_code = v_code
  for update;

  if not found
    or v_patient.archived_at is not null
    or v_patient.user_id is not null then
    insert into public.join_attempts (user_id, succeeded) values (v_uid, false);
    perform pg_sleep(0.2);
    return null;
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (v_patient.household_id, v_uid, 'patient');

  update public.patients
  set user_id = v_uid,
      link_code = null
  where id = v_patient.id;

  insert into public.join_attempts (user_id, succeeded) values (v_uid, true);
  return v_patient.household_id;
end;
$$;

-- Owner only. Detaches the account, drops the membership and the code. The
-- patient record itself is untouched, so the owner can re-link later.
create or replace function public.unlink_patient(p_patient_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_patient public.patients%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into v_patient
  from public.patients
  where id = p_patient_id
  for update;

  if not found then
    raise exception 'NOT_FOUND';
  end if;

  if not public.is_household_owner(v_patient.household_id) then
    raise exception 'NOT_OWNER';
  end if;

  if v_patient.user_id is not null then
    delete from public.household_members
    where household_id = v_patient.household_id
      and user_id = v_patient.user_id
      and role = 'patient';
  end if;

  update public.patients
  set user_id = null,
      link_code = null
  where id = p_patient_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Purge also removes the membership (no orphan link)
-- ---------------------------------------------------------------------------

create or replace function public.purge_patient(p_patient_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_patient public.patients%rowtype;
begin
  select * into v_patient from public.patients where id = p_patient_id;
  if not found then
    raise exception 'NOT_FOUND';
  end if;

  if not public.is_household_owner(v_patient.household_id) then
    raise exception 'NOT_OWNER';
  end if;

  if v_patient.archived_at is null then
    raise exception 'NOT_ARCHIVED';
  end if;

  if v_patient.user_id is not null then
    delete from public.household_members
    where household_id = v_patient.household_id
      and user_id = v_patient.user_id
      and role = 'patient';
  end if;

  delete from public.patients where id = p_patient_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Dose RPCs: patients may log their own doses, not everyone's
-- ---------------------------------------------------------------------------

-- Only the authorisation line changed: can_view_patient() is staff OR the
-- patient themself. Every other rule (archived, window, schedule time, stock,
-- skip reason, stock decrement, audit) is byte-for-byte as shipped.
create or replace function public.log_dose(
  p_medicine_id uuid,
  p_scheduled_date date,
  p_scheduled_time time,
  p_status text,
  p_skip_reason text default null,
  p_skip_note text default null,
  p_timezone text default 'UTC'
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_medicine public.medicines%rowtype;
  v_patient_archived timestamptz;
  v_status public.dose_status;
  v_reason public.skip_reason;
  v_note text;
  v_tz text;
  v_local_created date;
  v_log_id uuid;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into v_medicine
  from public.medicines
  where id = p_medicine_id
  for update;

  if not found then
    raise exception 'NOT_FOUND';
  end if;

  if v_medicine.archived_at is not null then
    raise exception 'ARCHIVED';
  end if;

  select archived_at into v_patient_archived
  from public.patients
  where id = v_medicine.patient_id;

  if v_patient_archived is not null then
    raise exception 'ARCHIVED';
  end if;

  if not public.can_view_patient(v_medicine.patient_id) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  v_tz := coalesce(nullif(btrim(p_timezone), ''), 'UTC');
  if not exists (
    select 1 from pg_catalog.pg_timezone_names where name = v_tz
  ) then
    v_tz := 'UTC';
  end if;

  if p_status not in ('taken', 'skipped') then
    raise exception 'INVALID_STATUS';
  end if;
  v_status := p_status::public.dose_status;

  if v_status = 'taken' then
    if p_skip_reason is not null
      or nullif(btrim(coalesce(p_skip_note, '')), '') is not null then
      raise exception 'INVALID_REASON';
    end if;
    v_reason := null;
    v_note := null;
  else
    if p_skip_reason is null
      or p_skip_reason not in ('forgot', 'out_of_stock', 'felt_unwell', 'doctor_advised') then
      raise exception 'INVALID_REASON';
    end if;
    v_reason := p_skip_reason::public.skip_reason;
    v_note := nullif(btrim(coalesce(p_skip_note, '')), '');
    if length(v_note) > 500 then
      raise exception 'NOTE_TOO_LONG';
    end if;
  end if;

  v_local_created := (v_medicine.created_at at time zone v_tz)::date;

  if p_scheduled_date < v_local_created then
    raise exception 'OUT_OF_WINDOW';
  end if;

  if v_medicine.treatment_end_date is not null
    and p_scheduled_date > v_medicine.treatment_end_date then
    raise exception 'OUT_OF_WINDOW';
  end if;

  if not (p_scheduled_time = any (v_medicine.schedule_times)) then
    raise exception 'INVALID_TIME';
  end if;

  if v_status = 'taken' and v_medicine.stock_on_hand <= 0 then
    raise exception 'OUT_OF_STOCK';
  end if;

  begin
    insert into public.dose_logs (
      medicine_id,
      patient_id,
      scheduled_date,
      scheduled_time,
      scheduled_for,
      timezone,
      status,
      skip_reason,
      skip_note,
      logged_by,
      last_modified_by
    )
    values (
      v_medicine.id,
      v_medicine.patient_id,
      p_scheduled_date,
      p_scheduled_time,
      (p_scheduled_date + p_scheduled_time) at time zone v_tz,
      v_tz,
      v_status,
      v_reason,
      v_note,
      v_uid,
      v_uid
    )
    returning id into v_log_id;
  exception when unique_violation then
    raise exception 'DOSE_ALREADY_LOGGED';
  end;

  if v_status = 'taken' then
    perform set_config('app.stock_change_reason', 'dose_taken', true);
    perform set_config('app.dose_log_id', v_log_id::text, true);

    update public.medicines
    set stock_on_hand = stock_on_hand - 1
    where id = v_medicine.id;

    perform set_config('app.dose_log_id', '', true);
  end if;

  return v_log_id;
end;
$$;

-- Undo stays staff-only: reverting taken → skipped returns stock, and a patient
-- may consume stock but never replenish it. Only the authorisation line changed.
create or replace function public.update_dose_status(
  p_dose_log_id uuid,
  p_status text,
  p_skip_reason text default null,
  p_skip_note text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_log public.dose_logs%rowtype;
  v_medicine public.medicines%rowtype;
  v_reason public.skip_reason;
  v_note text;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into v_log
  from public.dose_logs
  where id = p_dose_log_id
  for update;

  if not found then
    raise exception 'NOT_FOUND';
  end if;

  select * into v_medicine
  from public.medicines
  where id = v_log.medicine_id
  for update;

  if not public.is_household_staff(public.patient_household(v_log.patient_id)) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  if p_status not in ('taken', 'skipped') then
    raise exception 'INVALID_STATUS';
  end if;

  if p_status = 'skipped' then
    if p_skip_reason is null
      or p_skip_reason not in ('forgot', 'out_of_stock', 'felt_unwell', 'doctor_advised') then
      raise exception 'INVALID_REASON';
    end if;
    v_reason := p_skip_reason::public.skip_reason;
    v_note := nullif(btrim(coalesce(p_skip_note, '')), '');
    if length(v_note) > 500 then
      raise exception 'NOTE_TOO_LONG';
    end if;
  else
    v_reason := null;
    v_note := null;
  end if;

  -- Same status: only a skipped reason/note may be edited.
  if p_status::public.dose_status = v_log.status then
    if p_status = 'skipped' then
      update public.dose_logs
      set skip_reason = v_reason,
          skip_note = v_note,
          last_modified_by = v_uid,
          updated_at = now()
      where id = v_log.id;
    end if;
    return v_log.id;
  end if;

  if v_log.status = 'taken' and p_status = 'skipped' then
    perform set_config('app.stock_change_reason', 'dose_reverted', true);
    perform set_config('app.dose_log_id', v_log.id::text, true);

    update public.medicines
    set stock_on_hand = stock_on_hand + 1
    where id = v_medicine.id;
  elsif v_log.status = 'skipped' and p_status = 'taken' then
    if v_medicine.stock_on_hand <= 0 then
      raise exception 'OUT_OF_STOCK';
    end if;

    perform set_config('app.stock_change_reason', 'dose_taken', true);
    perform set_config('app.dose_log_id', v_log.id::text, true);

    update public.medicines
    set stock_on_hand = stock_on_hand - 1
    where id = v_medicine.id;
  end if;

  update public.dose_logs
  set status = p_status::public.dose_status,
      skip_reason = v_reason,
      skip_note = v_note,
      last_modified_by = v_uid,
      updated_at = now()
  where id = v_log.id;

  perform set_config('app.dose_log_id', '', true);

  return v_log.id;
end;
$$;

-- Restocking is staff-only. A patient-role member is a household member, so the
-- shipped is_household_member() check would have let them add stock. Only the
-- authorisation line changed.
create or replace function public.restock_medicine(p_medicine_id uuid, p_quantity integer)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_medicine public.medicines%rowtype;
  v_patient_archived timestamptz;
  v_new_stock integer;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_quantity is null or p_quantity < 1 or p_quantity > 10000 then
    raise exception 'INVALID_QUANTITY';
  end if;

  select * into v_medicine
  from public.medicines
  where id = p_medicine_id
  for update;

  if not found then
    raise exception 'NOT_FOUND';
  end if;

  if v_medicine.archived_at is not null then
    raise exception 'ARCHIVED';
  end if;

  select archived_at into v_patient_archived
  from public.patients
  where id = v_medicine.patient_id;

  if v_patient_archived is not null then
    raise exception 'ARCHIVED';
  end if;

  if not public.is_household_staff(public.patient_household(v_medicine.patient_id)) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  perform set_config('app.stock_change_reason', 'restock', true);

  update public.medicines
  set stock_on_hand = stock_on_hand + p_quantity
  where id = v_medicine.id
  returning stock_on_hand into v_new_stock;

  return v_new_stock;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Role guard: a patient holds exactly one membership, ever
-- ---------------------------------------------------------------------------

create or replace function public.guard_membership_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- A patient account links to one patient record in one household. The partial
  -- unique index also enforces this; checking here turns a unique violation into
  -- the same ROLE_FIXED the app already maps.
  if new.role = 'patient' then
    if exists (
      select 1 from public.household_members
      where user_id = new.user_id
    ) then
      raise exception 'ROLE_FIXED';
    end if;
    return new;
  end if;

  if new.role = 'caregiver' and exists (
    select 1 from public.household_members
    where user_id = new.user_id and role = 'owner'
  ) then
    raise exception 'ROLE_FIXED';
  end if;

  if exists (
    select 1 from public.household_members
    where user_id = new.user_id and role <> new.role
  ) then
    raise exception 'ROLE_FIXED';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Privileges on the new RPCs
-- ---------------------------------------------------------------------------

revoke all on function public.set_patient_link_code(uuid) from public, anon;
revoke all on function public.get_patient_link_code(uuid) from public, anon;
revoke all on function public.claim_patient(text) from public, anon;
revoke all on function public.unlink_patient(uuid) from public, anon;

grant execute on function public.set_patient_link_code(uuid) to authenticated;
grant execute on function public.get_patient_link_code(uuid) to authenticated;
grant execute on function public.claim_patient(text) to authenticated;
grant execute on function public.unlink_patient(uuid) to authenticated;
