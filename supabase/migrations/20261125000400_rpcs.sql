-- Security-definer RPCs. Every function validates auth.uid(), membership, and
-- raises a stable application error code that the UI maps to friendly copy.

create or replace function public.get_invite_code(p_household_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  if not public.is_household_owner(p_household_id) then
    raise exception 'NOT_OWNER';
  end if;

  select h.invite_code into v_code
  from public.households h
  where h.id = p_household_id;

  if v_code is null then
    raise exception 'NOT_FOUND';
  end if;

  return v_code;
end;
$$;

create or replace function public.regenerate_invite_code(p_household_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  if not public.is_household_owner(p_household_id) then
    raise exception 'NOT_OWNER';
  end if;

  v_code := public.generate_invite_code();

  update public.households
  set invite_code = v_code, updated_at = now()
  where id = p_household_id;

  return v_code;
end;
$$;

create or replace function public.join_household(p_code text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_code text;
  v_household_id uuid;
  v_failures integer;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  -- Owners can never join another household (fixed roles).
  if exists (
    select 1 from public.household_members
    where user_id = v_uid and role = 'owner'
  ) then
    raise exception 'OWNER_CANNOT_JOIN';
  end if;

  select count(*) into v_failures
  from public.join_attempts
  where user_id = v_uid
    and succeeded = false
    and attempted_at > now() - interval '1 hour';

  -- Failures return NULL instead of raising so the attempt row commits with
  -- the request; raising would roll the log back and the throttle could never
  -- engage. The server action maps NULL to the single generic error.
  if v_failures >= 5 then
    insert into public.join_attempts (user_id, succeeded) values (v_uid, false);
    perform pg_sleep(0.2);
    return null;
  end if;

  v_code := upper(regexp_replace(coalesce(p_code, ''), '[[:space:]-]', '', 'g'));

  select id into v_household_id
  from public.households
  where invite_code = v_code;

  if v_household_id is null then
    insert into public.join_attempts (user_id, succeeded) values (v_uid, false);
    perform pg_sleep(0.2);
    return null;
  end if;

  if not exists (
    select 1 from public.household_members
    where household_id = v_household_id and user_id = v_uid
  ) then
    insert into public.household_members (household_id, user_id, role)
    values (v_household_id, v_uid, 'caregiver');
  end if;

  insert into public.join_attempts (user_id, succeeded) values (v_uid, true);
  return v_household_id;
end;
$$;

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

  if not public.is_household_member(public.patient_household(v_medicine.patient_id)) then
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

  if not public.is_household_member(public.patient_household(v_medicine.patient_id)) then
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

  if not public.is_household_member(public.patient_household(v_log.patient_id)) then
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

  delete from public.patients where id = p_patient_id;
end;
$$;

create or replace function public.purge_medicine(p_medicine_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_medicine public.medicines%rowtype;
begin
  select * into v_medicine from public.medicines where id = p_medicine_id;
  if not found then
    raise exception 'NOT_FOUND';
  end if;

  if not public.is_household_owner(public.patient_household(v_medicine.patient_id)) then
    raise exception 'NOT_OWNER';
  end if;

  if v_medicine.archived_at is null then
    raise exception 'NOT_ARCHIVED';
  end if;

  delete from public.medicines where id = p_medicine_id;
end;
$$;

create or replace function public.remove_caregiver(p_household_id uuid, p_user_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_household_owner(p_household_id) then
    raise exception 'NOT_OWNER';
  end if;

  if not exists (
    select 1 from public.household_members
    where household_id = p_household_id
      and user_id = p_user_id
      and role = 'caregiver'
  ) then
    raise exception 'NOT_CAREGIVER';
  end if;

  delete from public.household_members
  where household_id = p_household_id
    and user_id = p_user_id
    and role = 'caregiver';
end;
$$;

revoke all on function public.get_invite_code(uuid) from public, anon;
revoke all on function public.regenerate_invite_code(uuid) from public, anon;
revoke all on function public.join_household(text) from public, anon;
revoke all on function public.restock_medicine(uuid, integer) from public, anon;
revoke all on function public.log_dose(uuid, date, time, text, text, text, text) from public, anon;
revoke all on function public.update_dose_status(uuid, text, text, text) from public, anon;
revoke all on function public.purge_patient(uuid) from public, anon;
revoke all on function public.purge_medicine(uuid) from public, anon;
revoke all on function public.remove_caregiver(uuid, uuid) from public, anon;

grant execute on function public.get_invite_code(uuid) to authenticated;
grant execute on function public.regenerate_invite_code(uuid) to authenticated;
grant execute on function public.join_household(text) to authenticated;
grant execute on function public.restock_medicine(uuid, integer) to authenticated;
grant execute on function public.log_dose(uuid, date, time, text, text, text, text) to authenticated;
grant execute on function public.update_dose_status(uuid, text, text, text) to authenticated;
grant execute on function public.purge_patient(uuid) to authenticated;
grant execute on function public.purge_medicine(uuid) to authenticated;
grant execute on function public.remove_caregiver(uuid, uuid) to authenticated;
