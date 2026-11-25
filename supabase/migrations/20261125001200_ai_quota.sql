-- WP3 — assistant quota (docs/three-role-ai-plan.md §7).
--
-- Vercel functions share no memory, so a per-instance counter would reset on
-- every cold start. The counter lives in the database and is consumed by a
-- security-definer RPC. The table is policy-free *and* grant-free: RLS alone
-- would leave Supabase's default privileges in place.

create table public.ai_usage (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  count integer not null default 0,
  primary key (user_id, day)
);

alter table public.ai_usage enable row level security;

revoke all on public.ai_usage from anon, authenticated;

-- Returns true when the question may be asked. One statement, so two parallel
-- requests cannot both slip under the limit.
create or replace function public.consume_ai_quota(p_limit integer default 30)
returns boolean
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

  insert into public.ai_usage (user_id, day, count)
  values (v_uid, current_date, 0)
  on conflict (user_id, day) do nothing;

  update public.ai_usage
  set count = count + 1
  where user_id = v_uid
    and day = current_date
    and count < p_limit
  returning count into v_count;

  return v_count is not null;
end;
$$;

revoke all on function public.consume_ai_quota(integer) from public, anon;
grant execute on function public.consume_ai_quota(integer) to authenticated;
