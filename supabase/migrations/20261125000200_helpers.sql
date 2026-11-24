-- Security-definer helpers used by RLS policies and RPCs.
-- All are schema-qualified and set an empty search_path to avoid hijacking.
create schema if not exists extensions;

create or replace function public.is_household_member(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members hm
    where hm.household_id = hid
      and hm.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_household_owner(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members hm
    where hm.household_id = hid
      and hm.user_id = (select auth.uid())
      and hm.role = 'owner'
  );
$$;

create or replace function public.household_role(hid uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select hm.role::text
  from public.household_members hm
  where hm.household_id = hid
    and hm.user_id = (select auth.uid())
  limit 1;
$$;

create or replace function public.patient_household(pid uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.household_id from public.patients p where p.id = pid;
$$;

create or replace function public.medicine_household(mid uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.household_id
  from public.medicines m
  join public.patients p on p.id = m.patient_id
  where m.id = mid;
$$;

create or replace function public.shares_household_with(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members mine
    join public.household_members theirs
      on theirs.household_id = mine.household_id
    where mine.user_id = (select auth.uid())
      and theirs.user_id = uid
  );
$$;

-- Generates a globally unique six-character code from an alphabet that
-- excludes look-alikes (0/O, 1/I). Internal only: not granted to clients.
create or replace function public.generate_invite_code()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text;
  i integer;
begin
  loop
    result := '';
    for i in 1..6 loop
      result := result || substr(
        alphabet,
        1 + (get_byte(extensions.gen_random_bytes(1), 0) % 32),
        1
      );
    end loop;
    exit when not exists (
      select 1 from public.households h where h.invite_code = result
    );
  end loop;
  return result;
end;
$$;

-- Ensures the extension is available in the extensions schema (Supabase default).
create extension if not exists pgcrypto with schema extensions;

revoke all on function public.is_household_member(uuid) from public, anon;
revoke all on function public.is_household_owner(uuid) from public, anon;
revoke all on function public.household_role(uuid) from public, anon;
revoke all on function public.patient_household(uuid) from public, anon;
revoke all on function public.medicine_household(uuid) from public, anon;
revoke all on function public.shares_household_with(uuid) from public, anon;
revoke all on function public.generate_invite_code() from public, anon, authenticated;

grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.is_household_owner(uuid) to authenticated;
grant execute on function public.household_role(uuid) to authenticated;
grant execute on function public.patient_household(uuid) to authenticated;
grant execute on function public.medicine_household(uuid) to authenticated;
grant execute on function public.shares_household_with(uuid) to authenticated;
