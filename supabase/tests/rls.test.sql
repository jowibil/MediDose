-- MediDose RLS proof suite.
-- Run with: npm run test:rls (local Supabase + psql).
-- Everything is wrapped in a transaction and rolled back, so it is rerunnable.
\set ON_ERROR_STOP on

begin;

create extension if not exists pgcrypto with schema extensions;

create or replace function public._assert_true(cond boolean, msg text)
returns void
language plpgsql
as $$
begin
  if cond is not true then
    raise exception 'FAIL: %', msg;
  end if;
end;
$$;

create or replace function public._expect_error(stmt text, expected text)
returns void
language plpgsql
as $$
begin
  begin
    execute stmt;
  exception when others then
    if position(expected in sqlerrm) = 0 then
      raise exception 'FAIL: expected error containing %, got %', expected, sqlerrm;
    end if;
    return;
  end;
  raise exception 'FAIL: expected error containing %, but the statement succeeded', expected;
end;
$$;

-- Fixtures: five auth users. The signup trigger provisions households for the
-- two owners and profiles only for the caregiver/unlinked/patient accounts.
insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
values
  ('11111111-1111-1111-1111-111111111111', 'owner-a@rls.test',
   extensions.crypt('password', extensions.gen_salt('bf')), now(),
   '{"account_type":"owner","display_name":"Owner A","household_name":"Household A"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'caregiver-b@rls.test',
   extensions.crypt('password', extensions.gen_salt('bf')), now(),
   '{"account_type":"caregiver","display_name":"Caregiver B"}'::jsonb),
  ('33333333-3333-3333-3333-333333333333', 'unlinked-c@rls.test',
   extensions.crypt('password', extensions.gen_salt('bf')), now(),
   '{"account_type":"caregiver","display_name":"Unlinked C"}'::jsonb),
  ('44444444-4444-4444-4444-444444444444', 'joiner-f@rls.test',
   extensions.crypt('password', extensions.gen_salt('bf')), now(),
   '{"account_type":"caregiver","display_name":"Joiner F"}'::jsonb),
  ('55555555-5555-5555-5555-555555555555', 'owner-d@rls.test',
   extensions.crypt('password', extensions.gen_salt('bf')), now(),
   '{"account_type":"owner","display_name":"Owner D","household_name":"Household D"}'::jsonb),
  ('66666666-6666-6666-6666-666666666666', 'patient-e@rls.test',
   extensions.crypt('password', extensions.gen_salt('bf')), now(),
   '{"account_type":"patient","display_name":"Patient E"}'::jsonb);

select id as household_a from public.households where created_by = '11111111-1111-1111-1111-111111111111' \gset
select id as household_d from public.households where created_by = '55555555-5555-5555-5555-555555555555' \gset
select invite_code as code_a from public.households where id = :'household_a' \gset

insert into public.patients (id, household_id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', :'household_a', 'Patient A'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', :'household_d', 'Patient D');

insert into public.medicines
  (id, patient_id, name, dosage_amount, frequency_per_day, schedule_mode,
   first_dose_time, schedule_times, stock_on_hand, expiration_date)
values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'Amoxicillin', 500, 2, 'waking_hours', '08:00', '{08:00,20:00}', 10, current_date + 365),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
   'Other Household Med', 10, 1, 'waking_hours', '08:00', '{08:00}', 10, current_date + 365);

insert into public.household_members (household_id, user_id, role)
values (:'household_a', '22222222-2222-2222-2222-222222222222', 'caregiver');

-- ============================ OWNER A ============================
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;

insert into public.patients (household_id, name)
values (:'household_a', 'Owner Added Patient');
select public._assert_true(
  (select count(*) from public.patients where name = 'Owner Added Patient') = 1,
  'owner can insert a patient in their household');

insert into public.medicines
  (patient_id, name, dosage_amount, frequency_per_day, schedule_times, stock_on_hand, expiration_date)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Owner Added Med', 10, 1, '{08:00}', 5, current_date + 30);
select public._assert_true(
  (select count(*) from public.medicines where name = 'Owner Added Med') = 1,
  'owner can insert a medicine in their household');

select public._assert_true(
  length(public.get_invite_code(:'household_a')) = 6,
  'owner can read their own invite code');

select public._assert_true(
  (select count(*) from public.households) = 1,
  'owner A only sees household A');

-- Owner cannot join another household.
select public._expect_error(
  format('select public.join_household(%L)', :'code_a'),
  'OWNER_CANNOT_JOIN');

-- Owners never log a dose, even with a valid household and medicine.
select public._expect_error(
  format(
    'select public.log_dose(%L, current_date, %L, %L, null, null, %L)',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '08:00', 'taken', 'UTC'),
  'NOT_AUTHORIZED');

reset role;

-- ============================ CAREGIVER B ============================
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);
set local role authenticated;

select public._assert_true(
  (select count(*) from public.medicines) = 2,
  'caregiver sees only linked-household medicines');
select public._assert_true(
  (select count(*) from public.patients) = 2,
  'caregiver sees only linked-household patients');

update public.patients set name = 'Hacked' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select public._assert_true(
  (select name from public.patients where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') = 'Patient A',
  'caregiver cannot update a patient');

with changed as (
  update public.medicines set name = 'Hacked' where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  returning id
)
select public._assert_true(
  (select count(*) from changed) = 0,
  'caregiver cannot update a medicine');

select public._expect_error(
  $$insert into public.medicines
      (patient_id, name, dosage_amount, frequency_per_day, schedule_times, stock_on_hand, expiration_date)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Caregiver Med', 10, 1, '{08:00}', 5, current_date + 30)$$,
  'row-level security');

select public._expect_error(
  $$insert into public.dose_logs
      (medicine_id, patient_id, scheduled_date, scheduled_time, scheduled_for, status)
    values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            current_date, '08:00', now(), 'taken')$$,
  'permission denied');

select public._expect_error(
  format('select public.get_invite_code(%L)', :'household_a'),
  'NOT_OWNER');

select public._expect_error(
  format('select public.restock_medicine(%L, 5)', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  'NOT_AUTHORIZED');

-- Restock is allowed and audited.
select public.restock_medicine('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 5);
select public._assert_true(
  (select stock_on_hand from public.medicines where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') = 15,
  'caregiver restock adds stock');
select public._assert_true(
  exists (
    select 1 from public.stock_adjustments
    where medicine_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
      and reason = 'restock' and delta = 5
  ),
  'restock writes a stock adjustment');

-- Taken decrements stock; skipped does not.
select public.log_dose('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', current_date, '08:00', 'taken', null, null, 'UTC');
select public._assert_true(
  (select stock_on_hand from public.medicines where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') = 14,
  'taken decrements stock');
select public.log_dose('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', current_date, '20:00', 'skipped', 'felt_unwell', 'queasy', 'UTC');
select public._assert_true(
  (select stock_on_hand from public.medicines where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') = 14,
  'skipped leaves stock unchanged');

-- Duplicate occurrence rejected.
select public._expect_error(
  format(
    'select public.log_dose(%L, %L, %L, %L, null, null, %L)',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', current_date, '08:00', 'taken', 'UTC'),
  'DOSE_ALREADY_LOGGED');

-- Invalid skip shapes rejected.
select public._expect_error(
  format(
    'select public.log_dose(%L, current_date + 1, %L, %L, %L, null, %L)',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '08:00', 'taken', 'forgot', 'UTC'),
  'INVALID_REASON');
select public._expect_error(
  format(
    'select public.log_dose(%L, current_date + 1, %L, %L, null, null, %L)',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '08:00', 'skipped', 'UTC'),
  'INVALID_REASON');

-- Reversal: taken -> skipped restores one; skipped -> taken decrements again.
select id as taken_log from public.dose_logs
where medicine_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  and scheduled_date = current_date and scheduled_time = '08:00' \gset

select public.update_dose_status(:'taken_log', 'skipped', 'forgot', null);
select public._assert_true(
  (select stock_on_hand from public.medicines where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') = 15,
  'taken -> skipped restores stock');
select public._assert_true(
  exists (
    select 1 from public.stock_adjustments
    where medicine_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
      and reason = 'dose_reverted' and delta = 1
  ),
  'reversal writes dose_reverted');

select public.update_dose_status(:'taken_log', 'taken');
select public._assert_true(
  (select stock_on_hand from public.medicines where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') = 14,
  'skipped -> taken decrements stock again');
select public._assert_true(
  exists (
    select 1 from public.stock_adjustments
    where medicine_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
      and reason = 'dose_taken'
  ),
  'taken writes dose_taken');

-- No revert to pending.
select public._expect_error(
  format('select public.update_dose_status(%L, %L)', :'taken_log', 'pending'),
  'INVALID_STATUS');

reset role;

-- The owner may not log, but correcting a logged dose stays theirs.
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;

select public.update_dose_status(:'taken_log', 'taken');
select public._assert_true(
  (select stock_on_hand from public.medicines where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') = 14,
  'owner can still correct a logged dose');

reset role;

-- ============================ PATIENT E (LINKED) ============================
-- log_dose() now names its callers explicitly, so a linked patient must still
-- log their own dose — and only their own.
select set_config('request.jwt.claims', '{}'::text, true);

update public.patients
set user_id = '66666666-6666-6666-6666-666666666666'
where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

insert into public.household_members (household_id, user_id, role)
values (:'household_a', '66666666-6666-6666-6666-666666666666', 'patient');

-- A sibling patient in the same household, with their own medicine.
insert into public.patients (id, household_id, name)
values ('99999999-9999-9999-9999-999999999999', :'household_a', 'Sibling Patient');

insert into public.medicines
  (id, patient_id, name, dosage_amount, frequency_per_day, schedule_times,
   stock_on_hand, expiration_date)
values
  ('abababab-abab-abab-abab-abababababab', '99999999-9999-9999-9999-999999999999',
   'Sibling Med', 10, 1, '{08:00}', 10, current_date + 90);

select set_config('request.jwt.claims', json_build_object('sub', '66666666-6666-6666-6666-666666666666', 'role', 'authenticated')::text, true);
set local role authenticated;

-- Own dose: allowed and recorded against the patient account. 20:00 on the
-- next day is left free by every other assertion in this file.
select public.log_dose('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', current_date + 1, '20:00', 'taken', null, null, 'UTC');
select public._assert_true(
  exists (
    select 1 from public.dose_logs
    where medicine_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
      and scheduled_date = current_date + 1
      and scheduled_time = '20:00'
      and status = 'taken'
      and logged_by = '66666666-6666-6666-6666-666666666666'
  ),
  'linked patient can log their own dose');

-- A sibling's dose: refused, and nothing is written.
select public._expect_error(
  format(
    'select public.log_dose(%L, current_date + 1, %L, %L, %L, null, %L)',
    'abababab-abab-abab-abab-abababababab', '08:00', 'skipped', 'forgot', 'UTC'),
  'NOT_AUTHORIZED');

reset role;

-- Checked as the migration owner: a patient's RLS hides a sibling's rows, so
-- "not exists" under the patient role would prove nothing either way.
select public._assert_true(
  not exists (
    select 1 from public.dose_logs
    where medicine_id = 'abababab-abab-abab-abab-abababababab'
  ),
  'refused sibling log writes nothing');

-- ============================ UNLINKED C ============================
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-3333-3333-333333333333', 'role', 'authenticated')::text, true);
set local role authenticated;

select public._assert_true((select count(*) from public.households) = 0, 'unlinked sees no households');
select public._assert_true((select count(*) from public.household_members) = 0, 'unlinked sees no memberships');
select public._assert_true((select count(*) from public.patients) = 0, 'unlinked sees no patients');
select public._assert_true((select count(*) from public.medicines) = 0, 'unlinked sees no medicines');
select public._assert_true((select count(*) from public.dose_logs) = 0, 'unlinked sees no dose logs');
select public._assert_true((select count(*) from public.stock_adjustments) = 0, 'unlinked sees no stock ledger');
select public._assert_true((select count(*) from public.profiles) = 1, 'unlinked sees only their own profile');

-- Invalid codes return NULL (so the attempt log commits) for the same
-- generic client-side error as every other join failure.
select public._assert_true(
  public.join_household('ZZZZZZ') is null,
  'invalid code returns null');

reset role;
select public._assert_true(
  (select count(*) from public.join_attempts
   where user_id = '33333333-3333-3333-3333-333333333333' and succeeded = false) = 1,
  'failed join attempt is logged');

-- ============================ OWNER D ISOLATION ============================
select set_config('request.jwt.claims', json_build_object('sub', '55555555-5555-5555-5555-555555555555', 'role', 'authenticated')::text, true);
set local role authenticated;

select public._assert_true(
  (select count(*) from public.medicines) = 1,
  'owner D cannot see household A medicines');
select public._assert_true(
  (select name from public.medicines limit 1) = 'Other Household Med',
  'owner D sees only their own medicine');
select public._expect_error(
  format('select public.get_invite_code(%L)', :'household_a'),
  'NOT_OWNER');

reset role;

-- ============================ JOIN + THROTTLE ============================
select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-4444-444444444444', 'role', 'authenticated')::text, true);
set local role authenticated;

select public.join_household(:'code_a');
select public._assert_true(
  exists (
    select 1 from public.household_members
    where household_id = :'household_a'
      and user_id = '44444444-4444-4444-4444-444444444444'
      and role = 'caregiver'
  ),
  'valid code links a caregiver');

reset role;
select public._assert_true(
  (select count(*) from public.join_attempts where user_id = '44444444-4444-4444-4444-444444444444' and succeeded) = 1,
  'successful join is logged without the code');

select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-3333-3333-333333333333', 'role', 'authenticated')::text, true);
set local role authenticated;

select public._assert_true(public.join_household('ABCDEF') is null, 'failure 2 is generic');
select public._assert_true(public.join_household('ABCDEF') is null, 'failure 3 is generic');
select public._assert_true(public.join_household('ABCDEF') is null, 'failure 4 is generic');
select public._assert_true(public.join_household('ABCDEF') is null, 'failure 5 is generic');
select public._assert_true(public.join_household('ABCDEF') is null, 'failure 6 is generic');
select public._assert_true(public.join_household('ABCDEF') is null, 'throttled failure is generic');

reset role;
select public._assert_true(
  (select count(*) from public.join_attempts
   where user_id = '33333333-3333-3333-3333-333333333333' and succeeded = false) >= 6,
  'failed join attempts are logged (throttle can engage)');

-- ============================ ARCHIVE / PURGE / CHECK CONSTRAINTS ============================
update public.medicines set archived_at = now()
where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);
set local role authenticated;

select public._expect_error(
  format('select public.restock_medicine(%L, 5)', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  'ARCHIVED');
select public._expect_error(
  format(
    'select public.log_dose(%L, current_date + 2, %L, %L, null, null, %L)',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '08:00', 'skipped', 'forgot', 'UTC'),
  'ARCHIVED');

reset role;

update public.medicines set archived_at = null
where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

-- Taken at zero stock is rejected.
update public.medicines set stock_on_hand = 0
where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);
set local role authenticated;

select public._expect_error(
  format(
    'select public.log_dose(%L, current_date + 1, %L, %L, null, null, %L)',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '08:00', 'taken', 'UTC'),
  'OUT_OF_STOCK');

reset role;
update public.medicines set stock_on_hand = 14
where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

-- DB CHECK constraints are the final authority.
select public._expect_error(
  $$insert into public.dose_logs
      (medicine_id, patient_id, scheduled_date, scheduled_time, scheduled_for, status, skip_reason)
    values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            current_date, '09:00', now(), 'taken', 'forgot')$$,
  'dose_logs_status_fields');
select public._expect_error(
  $$insert into public.dose_logs
      (medicine_id, patient_id, scheduled_date, scheduled_time, scheduled_for, status)
    values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            current_date, '09:30', now(), 'skipped')$$,
  'dose_logs_status_fields');

-- Purge requires archived + owner.
insert into public.medicines
  (id, patient_id, name, dosage_amount, frequency_per_day, schedule_times, stock_on_hand, expiration_date)
values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'Purge Candidate', 10, 1, '{08:00}', 1, current_date + 30);

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);
set local role authenticated;
select public._expect_error(
  format('select public.purge_medicine(%L)', 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  'NOT_OWNER');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;
select public._expect_error(
  format('select public.purge_medicine(%L)', 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  'NOT_ARCHIVED');
reset role;

update public.medicines set archived_at = now()
where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.purge_medicine('cccccccc-cccc-cccc-cccc-cccccccccccc');
select public._assert_true(
  not exists (select 1 from public.medicines where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  'owner can purge an archived medicine');

-- ============================ REMOVE CAREGIVER ============================
-- A caregiver cannot remove anyone.
reset role;
select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-4444-444444444444', 'role', 'authenticated')::text, true);
set local role authenticated;
select public._expect_error(
  format('select public.remove_caregiver(%L, %L)', :'household_a', '22222222-2222-2222-2222-222222222222'),
  'NOT_OWNER');

-- The owner can remove a caregiver.
reset role;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.remove_caregiver(:'household_a', '22222222-2222-2222-2222-222222222222');

reset role;

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);
set local role authenticated;
select public._assert_true(
  (select count(*) from public.medicines) = 0,
  'removed caregiver loses access immediately');

reset role;

select 'All RLS assertions passed.' as result;

rollback;
