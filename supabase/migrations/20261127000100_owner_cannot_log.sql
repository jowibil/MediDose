-- Owners do not log doses: their only dose action is correcting a logged one
-- (docs/PROJECT_CONTEXT.md §2). Until now that rule lived only in DoseControls
-- (`canLog`); this migration moves it into the RPC, so a direct call is refused
-- too.
--
-- `update_dose_status` is deliberately untouched: it stays staff-only, which is
-- what keeps Taken ↔ Skipped corrections available to an owner.
--
-- Only the authorisation block changes. Every other rule (archived, window,
-- schedule time, stock, skip reason, stock decrement, audit) is byte-for-byte
-- as shipped in 20261125000700_patient_role.sql.
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

  -- Two callers may log: a caregiver of the patient's household, or the
  -- patient bound to that record. An owner is refused on purpose — the
  -- correction path for them is update_dose_status(), not a fresh log.
  if not (
    v_medicine.patient_id = public.self_patient_id()
    or exists (
      select 1
      from public.household_members hm
      where hm.household_id = public.patient_household(v_medicine.patient_id)
        and hm.user_id = v_uid
        and hm.role = 'caregiver'
    )
  ) then
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
