-- WP5 — disposal (docs/three-role-ai-plan.md §9).
--
-- Disposal is archive-with-zero-stock, not deletion: the medicine leaves the
-- cabinet and its dose history stays readable. purge_medicine() remains the
-- destructive path, from Settings.
--
-- The stock_change_reason values 'disposed' and 'dispose_reverted' were added in
-- 20261125000600_enum_values.sql, so they are usable here (a new enum value
-- cannot be referenced in the transaction that creates it).

create or replace function public.dispose_medicine(p_medicine_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_medicine public.medicines%rowtype;
  v_discarded integer;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into v_medicine
  from public.medicines
  where id = p_medicine_id
  for update;

  if not found then
    raise exception 'NOT_FOUND';
  end if;

  if not public.is_household_owner(public.patient_household(v_medicine.patient_id)) then
    raise exception 'NOT_OWNER';
  end if;

  if v_medicine.archived_at is not null then
    raise exception 'ARCHIVED';
  end if;

  v_discarded := v_medicine.stock_on_hand;

  -- Read by audit_stock_change() to label the ledger row. A zero-stock disposal
  -- writes no row (delta 0) and still archives, which is the intended result:
  -- the medicine leaves the cabinet either way.
  perform set_config('app.stock_change_reason', 'disposed', true);

  update public.medicines
  set stock_on_hand = 0,
      archived_at = now()
  where id = v_medicine.id;

  return v_discarded;
end;
$$;

create or replace function public.undo_dispose_medicine(p_medicine_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_medicine public.medicines%rowtype;
  v_disposed public.stock_adjustments%rowtype;
  v_restored integer;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into v_medicine
  from public.medicines
  where id = p_medicine_id
  for update;

  if not found then
    raise exception 'NOT_FOUND';
  end if;

  if not public.is_household_owner(public.patient_household(v_medicine.patient_id)) then
    raise exception 'NOT_OWNER';
  end if;

  -- Still disposed, and nobody has restocked it in the meantime.
  if v_medicine.archived_at is null or v_medicine.stock_on_hand <> 0 then
    raise exception 'NOT_DISPOSED';
  end if;

  select * into v_disposed
  from public.stock_adjustments
  where medicine_id = p_medicine_id
    and reason = 'disposed'
  order by created_at desc
  limit 1;

  if not found then
    raise exception 'NOT_DISPOSED';
  end if;

  -- The banner offers ~30 s; the server allows 5 minutes so a slow round trip
  -- or a page refresh does not silently break the undo the UI just promised.
  -- It is read from the ledger, never from the caller.
  if v_disposed.created_at < now() - interval '5 minutes' then
    raise exception 'UNDO_WINDOW_EXPIRED';
  end if;

  v_restored := abs(v_disposed.delta);

  perform set_config('app.stock_change_reason', 'dispose_reverted', true);

  update public.medicines
  set stock_on_hand = v_restored,
      archived_at = null
  where id = p_medicine_id;

  return v_restored;
end;
$$;

revoke all on function public.dispose_medicine(uuid) from public, anon;
grant execute on function public.dispose_medicine(uuid) to authenticated;

revoke all on function public.undo_dispose_medicine(uuid) from public, anon;
grant execute on function public.undo_dispose_medicine(uuid) to authenticated;
