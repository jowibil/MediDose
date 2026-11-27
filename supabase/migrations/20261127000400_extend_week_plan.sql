-- A medicine created after its week was frozen has no expected_doses rows, so
-- every dose of it is counted as off-plan: the caregiver logs four doses and the
-- summary says "no scheduled doses", with adherence NULL. The freeze itself must
-- stay one-shot (editing a frequency must not rewrite a week), but a medicine
-- the freeze could not know about is a gap, not a fact.
--
-- This adds slots only for a medicine that has none in that week, and only
-- while that week is the one in progress. A medicine already in the plan is
-- never extended, so editing its schedule still cannot move the frozen numbers.

create or replace function public.extend_week_plan(
  p_patient_id uuid,
  p_week_start date,
  p_slots jsonb
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tz text;
  v_this_week date;
  v_added integer;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not exists (select 1 from public.patients where id = p_patient_id) then
    raise exception 'NOT_FOUND';
  end if;

  -- Same gate as freeze_week(): staff and the patient themself, because the
  -- dashboard calls this on every visit for every role.
  if not public.can_view_patient(p_patient_id) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  select timezone into v_tz
  from public.week_plans
  where patient_id = p_patient_id
    and week_start = p_week_start;

  -- Nothing frozen here: freeze_week() owns the first write.
  if v_tz is null then
    return 0;
  end if;

  v_this_week := date_trunc('week', (now() at time zone v_tz))::date;

  -- Only the week in progress. A finished week's numbers were already
  -- reported, so it stays exactly as it was.
  if p_week_start <> v_this_week then
    return 0;
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
    and raw.date::date >= m.created_at::date
    and (m.archived_at is null or raw.date::date <= m.archived_at::date)
    and (m.treatment_end_date is null or raw.date::date <= m.treatment_end_date)
    -- The whole point: a medicine the frozen week never captured. An existing
    -- one would turn a schedule edit into new expected doses.
    and not exists (
      select 1
      from public.expected_doses e
      where e.patient_id = p_patient_id
        and e.week_start = p_week_start
        and e.medicine_id = m.id
    )
  on conflict do nothing;

  get diagnostics v_added = row_count;
  return v_added;
end;
$$;

revoke all on function public.extend_week_plan(uuid, date, jsonb) from public, anon;
grant execute on function public.extend_week_plan(uuid, date, jsonb) to authenticated;
