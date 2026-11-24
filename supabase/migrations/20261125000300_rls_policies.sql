-- Row Level Security. Deny by default; every policy uses security-definer
-- helpers so policies never recurse into each other's tables.

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.patients enable row level security;
alter table public.medicines enable row level security;
alter table public.dose_logs enable row level security;
alter table public.stock_adjustments enable row level security;
alter table public.join_attempts enable row level security;

-- Reset the broad default grants Supabase applies to new tables.
revoke all on public.profiles from anon, authenticated;
revoke all on public.households from anon, authenticated;
revoke all on public.household_members from anon, authenticated;
revoke all on public.patients from anon, authenticated;
revoke all on public.medicines from anon, authenticated;
revoke all on public.dose_logs from anon, authenticated;
revoke all on public.stock_adjustments from anon, authenticated;
revoke all on public.join_attempts from anon, authenticated;

-- profiles: read own or shared household profiles; update own display name.
grant select on public.profiles to authenticated;
grant update (display_name, updated_at) on public.profiles to authenticated;

create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.shares_household_with(id));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- households: members read non-secret columns; owners rename. The invite code
-- is hidden by column-level privileges and read only via get_invite_code().
grant select (id, name, created_by, created_at, updated_at)
  on public.households to authenticated;
grant update (name, updated_at) on public.households to authenticated;

create policy households_select on public.households
  for select to authenticated
  using (public.is_household_member(id));

create policy households_update_owner on public.households
  for update to authenticated
  using (public.is_household_owner(id))
  with check (public.is_household_owner(id));

-- household_members: members read; owners may remove caregivers.
grant select on public.household_members to authenticated;
grant delete on public.household_members to authenticated;

create policy household_members_select on public.household_members
  for select to authenticated
  using (public.is_household_member(household_id));

create policy household_members_delete_caregiver on public.household_members
  for delete to authenticated
  using (role = 'caregiver' and public.is_household_owner(household_id));

-- patients: members read; owners insert/update (archive). DELETE is RPC only.
grant select, insert, update on public.patients to authenticated;

create policy patients_select on public.patients
  for select to authenticated
  using (public.is_household_member(household_id));

create policy patients_insert_owner on public.patients
  for insert to authenticated
  with check (public.is_household_owner(household_id));

create policy patients_update_owner on public.patients
  for update to authenticated
  using (public.is_household_owner(household_id))
  with check (public.is_household_owner(household_id));

-- medicines: members read; owners insert/update. Stock writes by caregivers
-- happen only through restock_medicine().
grant select, insert, update on public.medicines to authenticated;

create policy medicines_select on public.medicines
  for select to authenticated
  using (public.is_household_member(public.patient_household(patient_id)));

create policy medicines_insert_owner on public.medicines
  for insert to authenticated
  with check (public.is_household_owner(public.patient_household(patient_id)));

create policy medicines_update_owner on public.medicines
  for update to authenticated
  using (public.is_household_owner(public.patient_household(patient_id)))
  with check (public.is_household_owner(public.patient_household(patient_id)));

-- dose_logs: members read; all writes go through log_dose/update_dose_status.
grant select on public.dose_logs to authenticated;

create policy dose_logs_select on public.dose_logs
  for select to authenticated
  using (public.is_household_member(public.patient_household(patient_id)));

-- stock_adjustments: members read the ledger; trigger/RPC writes only.
grant select on public.stock_adjustments to authenticated;

create policy stock_adjustments_select on public.stock_adjustments
  for select to authenticated
  using (public.is_household_member(public.medicine_household(medicine_id)));

-- join_attempts has RLS enabled and no policies: only security-definer RPCs
-- can read or write it.
