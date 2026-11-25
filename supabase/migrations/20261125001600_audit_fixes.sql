-- Post-WP5 audit fixes.
--
-- 1. Drop consume_ai_quota(). begin_ai_request() replaced it in 01300 and the
--    route has not called it since; 01300 kept it "because it may be deployed",
--    which was not true — WP3's route was never deployed ahead of this change.
--    A second quota function with different semantics is a trap for the next
--    person reading the schema.
--
-- 2. refund_ai_request(). The quota is consumed *before* the provider call so
--    two concurrent requests cannot both pass the limit. That means a provider
--    failure — a 502, an empty answer — used to cost the person a question they
--    never got an answer to. The route refunds on failure.
--
-- 3. restore_future_expected(). Disposing a medicine removes its future frozen
--    slots (doses nobody can take must not depress adherence), and undo put the
--    medicine back without the slots — leaving the week's denominator smaller
--    than the cabinet. Undo now restores both.

drop function if exists public.consume_ai_quota(integer);

-- The cooldown is deliberately not cleared: a failed call refunds the daily
-- count, but retrying a struggling provider in a tight loop is still wrong.
create or replace function public.refund_ai_request()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_count integer;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  update public.ai_usage
  set count = greatest(count - 1, 0)
  where user_id = v_uid
    and day = current_date
  returning count into v_count;

  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.refund_ai_request() from public, anon;
grant execute on function public.refund_ai_request() to authenticated;

-- Re-inserts the frozen slots that remove_future_expected() deleted, for a
-- medicine that is back in the cabinet. Rebuilt from the medicine's *current*
-- schedule — the same source freeze_week() validates against — restricted to
-- future days inside weeks that are already frozen, so it can never invent a
-- slot the plan did not have.
create or replace function public.restore_future_expected(
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
  v_restored integer;
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

  if not public.is_household_staff(
    public.patient_household(v_medicine.patient_id)
  ) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  insert into public.expected_doses (
    patient_id,
    week_start,
    medicine_id,
    medicine_name,
    scheduled_date,
    scheduled_time
  )
  select
    v_medicine.patient_id,
    wp.week_start,
    v_medicine.id,
    v_medicine.name,
    day::date,
    slot
  from public.week_plans wp
  cross join lateral unnest(v_medicine.schedule_times) as slot
  cross join lateral generate_series(
    greatest(p_today + 1, wp.week_start)::timestamp,
    (wp.week_start + 6)::timestamp,
    interval '1 day'
  ) as day
  where wp.patient_id = v_medicine.patient_id
    and (v_medicine.treatment_end_date is null
         or day::date <= v_medicine.treatment_end_date)
    and day::date >= v_medicine.created_at::date
  on conflict do nothing;

  get diagnostics v_restored = row_count;

  -- Keep the "removed midweek" narrative honest: those doses are back, so the
  -- count goes down and an entry that reaches zero disappears.
  if v_restored > 0 then
    update public.weekly_summaries ws
    set removed_midweek = coalesce((
      select jsonb_agg(rebuilt.entry)
      from (
        select jsonb_build_object(
          'medicine_name', e->>'medicine_name',
          'count', greatest(
            coalesce((e->>'count')::int, 0)
              - case
                  when e->>'medicine_name' = v_medicine.name then v_restored
                  else 0
                end,
            0
          ),
          'removed_on', e->>'removed_on'
        ) as entry
        from jsonb_array_elements(ws.removed_midweek) e
      ) rebuilt
      where (rebuilt.entry->>'count')::int > 0
    ), '[]'::jsonb)
    where ws.patient_id = v_medicine.patient_id
      and p_today between ws.week_start and ws.week_end;
  end if;

  return v_restored;
end;
$$;

revoke all on function public.restore_future_expected(uuid, date) from public, anon;
grant execute on function public.restore_future_expected(uuid, date) to authenticated;
