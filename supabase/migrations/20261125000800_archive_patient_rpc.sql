-- Archiving a patient also clears its link code: an archived record cannot be
-- claimed while it is out of the cabinet (docs/three-role-ai-plan.md §5.4).
--
-- patients.link_code is outside the column-level UPDATE grant, so this cannot be
-- a plain UPDATE from the app — and it must not become one, or every household
-- member could rewrite link codes.

create or replace function public.archive_patient(p_patient_id uuid)
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

  if v_patient.archived_at is not null then
    raise exception 'ARCHIVED';
  end if;

  update public.patients
  set archived_at = now(),
      link_code = null
  where id = p_patient_id;
end;
$$;

revoke all on function public.archive_patient(uuid) from public, anon;
grant execute on function public.archive_patient(uuid) to authenticated;
