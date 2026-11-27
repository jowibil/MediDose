-- Adding a patient failed with
--   42501 new row violates row-level security policy for table "patients"
-- even though patients_insert_owner passed. The failing policy was the SELECT
-- one: createPatientAction does insert(...).select("id"), and Postgres applies
-- the SELECT policy to the RETURNING row.
--
-- 20261125000700 narrowed patients_select to can_view_patient(id), which is a
-- security-definer subquery over public.patients. Inside the same statement that
-- new row is not visible to that subquery, so the policy saw nothing and the
-- RETURNING was refused.
--
-- The policy now also accepts is_household_staff(household_id). That helper only
-- reads household_members, so it answers for a row that the current statement is
-- still inserting, and it is exactly the household-wide branch can_view_patient
-- already granted staff. A patient account still fails the staff branch and is
-- limited to can_view_patient(id) — its own record only.
--
-- Insert/update policies are untouched, so only an owner may still add a
-- patient (patients_insert_owner).
drop policy if exists patients_select on public.patients;
create policy patients_select on public.patients
  for select to authenticated
  using (
    public.is_household_staff(household_id)
    or public.can_view_patient(id)
  );
