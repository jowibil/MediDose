-- Triggers: signup provisioning, role guard, stock audit, dose consistency,
-- medicine date validation, and updated_at maintenance.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger households_set_updated_at
  before update on public.households
  for each row execute function public.set_updated_at();

create trigger patients_set_updated_at
  before update on public.patients
  for each row execute function public.set_updated_at();

create trigger medicines_set_updated_at
  before update on public.medicines
  for each row execute function public.set_updated_at();

create trigger dose_logs_set_updated_at
  before update on public.dose_logs
  for each row execute function public.set_updated_at();

-- Signup provisioning: every user gets a profile. Only account_type = 'owner'
-- gets a household + owner membership + invite code (D20/D21).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_display text;
  v_account text;
  v_household_name text;
  v_household_id uuid;
begin
  v_display := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '');
  if v_display is null then
    v_display := split_part(coalesce(new.email, ''), '@', 1);
  end if;
  if v_display is null or btrim(v_display) = '' then
    v_display := 'MediDose user';
  end if;

  insert into public.profiles (id, display_name)
  values (new.id, v_display)
  on conflict (id) do nothing;

  v_account := coalesce(new.raw_user_meta_data ->> 'account_type', 'caregiver');

  if v_account = 'owner' then
    v_household_name := nullif(
      btrim(coalesce(new.raw_user_meta_data ->> 'household_name', '')),
      ''
    );
    if v_household_name is null then
      v_household_name := v_display || '''s household';
    end if;

    insert into public.households (name, invite_code, created_by)
    values (v_household_name, public.generate_invite_code(), new.id)
    returning id into v_household_id;

    insert into public.household_members (household_id, user_id, role)
    values (v_household_id, new.id, 'owner');
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Roles are immutable: a user cannot hold a different role in another
-- membership, and an owner can never be added as a caregiver.
create or replace function public.guard_membership_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
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

create trigger household_members_guard_role
  before insert on public.household_members
  for each row execute function public.guard_membership_role();

-- Every stock delta is recorded, regardless of entry point. RPCs set
-- app.stock_change_reason / app.dose_log_id transaction-locally first.
create or replace function public.audit_stock_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delta integer;
  v_reason text;
  v_dose_log_id uuid;
begin
  if tg_op = 'INSERT' then
    v_delta := new.stock_on_hand;
  else
    v_delta := new.stock_on_hand - old.stock_on_hand;
  end if;

  if v_delta = 0 then
    return new;
  end if;

  v_reason := nullif(current_setting('app.stock_change_reason', true), '');
  if v_reason is null then
    v_reason := case when tg_op = 'INSERT' then 'initial' else 'owner_edit' end;
  end if;

  begin
    v_dose_log_id := nullif(current_setting('app.dose_log_id', true), '')::uuid;
  exception when others then
    v_dose_log_id := null;
  end;

  insert into public.stock_adjustments (
    medicine_id,
    delta,
    reason,
    actor,
    dose_log_id
  )
  values (
    new.id,
    v_delta,
    v_reason::public.stock_change_reason,
    (select auth.uid()),
    v_dose_log_id
  );

  return new;
end;
$$;

create trigger medicines_audit_stock
  after insert or update of stock_on_hand on public.medicines
  for each row execute function public.audit_stock_change();

-- Defense in depth: a log's patient must match the medicine's patient.
create or replace function public.check_dose_log_patient()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.patient_id <> (
    select patient_id from public.medicines where id = new.medicine_id
  ) then
    raise exception 'PATIENT_MISMATCH';
  end if;
  return new;
end;
$$;

create trigger dose_logs_check_patient
  before insert or update on public.dose_logs
  for each row execute function public.check_dose_log_patient();

-- Application validation blocks past dates; this is the final guard for new
-- rows created outside the app (the RPCs never insert medicines).
create or replace function public.validate_medicine_dates()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.expiration_date < current_date then
    raise exception 'EXPIRED_DATE';
  end if;
  if new.treatment_end_date is not null and new.treatment_end_date < current_date then
    raise exception 'INVALID_TREATMENT_END';
  end if;
  return new;
end;
$$;

create trigger medicines_validate_dates
  before insert on public.medicines
  for each row execute function public.validate_medicine_dates();

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.guard_membership_role() from public, anon, authenticated;
revoke all on function public.audit_stock_change() from public, anon, authenticated;
revoke all on function public.check_dose_log_patient() from public, anon, authenticated;
revoke all on function public.validate_medicine_dates() from public, anon, authenticated;
