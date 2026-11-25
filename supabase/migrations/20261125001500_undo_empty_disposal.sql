-- WP5 follow-up: undoing a disposal of an empty pack.
--
-- dispose_medicine() with stock_on_hand = 0 still archives the medicine, but
-- audit_stock_change() skips a delta of 0, so there is no 'disposed' ledger row
-- to read the quantity from. undo_dispose_medicine() then raised NOT_DISPOSED
-- for a disposal the UI had just announced and offered to undo.
--
-- The fallback is deliberately narrow: same owner check, medicine still archived
-- with stock 0, and archived within the same five-minute window. Nothing is
-- restored because nothing was discarded — only the archive is reversed.

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
    -- Zero-stock disposal: no ledger row, so undo is just the archive reversal.
    if v_medicine.archived_at >= now() - interval '5 minutes' then
      perform set_config('app.stock_change_reason', 'dispose_reverted', true);

      update public.medicines
      set archived_at = null
      where id = p_medicine_id;

      return 0;
    end if;

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

revoke all on function public.undo_dispose_medicine(uuid) from public, anon;
grant execute on function public.undo_dispose_medicine(uuid) to authenticated;
