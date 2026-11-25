-- 20261125001000 only recorded removals when a summary row already existed,
-- which is the wrong order: a medicine is usually archived before anyone
-- generates that week's summary. Persist a placeholder row instead, so the
-- removal is still there to be named in the prose.

create or replace function public.remove_future_expected(
  p_medicine_id uuid,
  p_today date
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_medicine public.medicines%rowtype;
  v_household uuid;
  v_week_start date;
  v_tz text;
  v_removed integer;
  v_entry jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into v_medicine
  from public.medicines
  where id = p_medicine_id;

  if not found then
    raise exception 'NOT_FOUND';
  end if;

  select household_id into v_household
  from public.patients
  where id = v_medicine.patient_id;

  if not public.is_household_staff(v_household) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  delete from public.expected_doses
  where medicine_id = p_medicine_id
    and scheduled_date > p_today;

  get diagnostics v_removed = row_count;

  if v_removed = 0 then
    return 0;
  end if;

  select coalesce(nullif(h.timezone, ''), 'UTC') into v_tz
  from public.households h
  where h.id = v_household;

  v_week_start := date_trunc('week', p_today)::date;
  v_entry := jsonb_build_array(
    jsonb_build_object(
      'medicine_name', v_medicine.name,
      'count', v_removed,
      'removed_on', p_today
    )
  );

  insert into public.weekly_summaries (
    patient_id,
    household_id,
    week_start,
    week_end,
    timezone,
    plan_tracked,
    removed_midweek
  )
  values (
    v_medicine.patient_id,
    v_household,
    v_week_start,
    v_week_start + 6,
    v_tz,
    true,
    v_entry
  )
  on conflict (patient_id, week_start) do update set
    removed_midweek = public.weekly_summaries.removed_midweek || excluded.removed_midweek;

  return v_removed;
end;
$$;

revoke all on function public.remove_future_expected(uuid, date) from public, anon;
grant execute on function public.remove_future_expected(uuid, date) to authenticated;
