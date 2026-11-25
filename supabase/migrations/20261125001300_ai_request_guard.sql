-- WP3 hardening — burst guard for the assistant (docs/three-role-ai-plan.md §7).
--
-- The daily quota stops a long grind; it does nothing about thirty requests in
-- thirty seconds. This adds the minimum interval between accepted requests and
-- returns *why* a request was refused, so the UI can say "slow down" instead of
-- "you are out of questions".
--
-- consume_ai_quota() is left in place: it is a deployed function signature, and
-- dropping it would break any build still calling it. The route uses this one.

alter table public.ai_usage add column last_request_at timestamptz;

create or replace function public.begin_ai_request(
  p_daily_limit integer default 30,
  p_cooldown_seconds integer default 2
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_count integer;
  v_last timestamptz;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  insert into public.ai_usage (user_id, day, count)
  values (v_uid, current_date, 0)
  on conflict (user_id, day) do nothing;

  -- Row lock: two parallel tabs must not both pass the cooldown check.
  select count, last_request_at
  into v_count, v_last
  from public.ai_usage
  where user_id = v_uid
    and day = current_date
  for update;

  if v_last is not null
    and v_last > now() - make_interval(secs => greatest(p_cooldown_seconds, 0)) then
    return 'cooldown';
  end if;

  if v_count >= p_daily_limit then
    return 'limit';
  end if;

  update public.ai_usage
  set count = count + 1,
      last_request_at = now()
  where user_id = v_uid
    and day = current_date;

  return 'ok';
end;
$$;

revoke all on function public.begin_ai_request(integer, integer) from public, anon;
grant execute on function public.begin_ai_request(integer, integer) to authenticated;
