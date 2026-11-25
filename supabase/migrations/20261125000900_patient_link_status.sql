-- Settings needs to show whether a patient row already has an account without
-- reading patients.user_id, which stays outside the column grant. Three states,
-- owner only (docs/three-role-ai-plan.md §5.4):
--   linked — user_id set; only Unlink is offered
--   code   — a code exists but nobody claimed it; show it, allow a new one
--   none   — no account and no code; offer "Link account"

create or replace function public.patient_link_status(p_patient_id uuid)
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

  if v_patient.user_id is not null then
    return 'linked';
  end if;

  if v_patient.link_code is not null then
    return 'code';
  end if;

  return 'none';
end;
$$;

revoke all on function public.patient_link_status(uuid) from public, anon;
grant execute on function public.patient_link_status(uuid) to authenticated;
