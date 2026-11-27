-- WP6 follow-up: Undo now clears a mistaken entry instead of recording a skip.
--
-- `pending` is the absence of a `dose_logs` row — the table's check constraint
-- forbids storing it — so undoing means deleting the row, which frees the slot
-- to be logged correctly. The stock side effect is reversed with it: a taken
-- dose returns one unit (`dose_reverted`), while a skipped dose never moved
-- stock. `stock_adjustments.dose_log_id` is `on delete set null`, so the
-- compensating ledger row keeps its actor and delta after the dose row is gone.
--
-- Everything else is unchanged from `..._patient_role.sql`: staff-only
-- authorisation, row locks, and the skip-reason rules for `taken` / `skipped`.
create or replace function public.update_dose_status(
  p_dose_log_id uuid,
  p_status text,
  p_skip_reason text default null,
  p_skip_note text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_log public.dose_logs%rowtype;
  v_medicine public.medicines%rowtype;
  v_reason public.skip_reason;
  v_note text;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into v_log
  from public.dose_logs
  where id = p_dose_log_id
  for update;

  if not found then
    raise exception 'NOT_FOUND';
  end if;

  select * into v_medicine
  from public.medicines
  where id = v_log.medicine_id
  for update;

  if not public.is_household_staff(public.patient_household(v_log.patient_id)) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  if p_status not in ('taken', 'skipped', 'pending') then
    raise exception 'INVALID_STATUS';
  end if;

  -- Undo: remove the log. A taken dose gave one unit back; nothing else did.
  if p_status = 'pending' then
    if v_log.status = 'taken' then
      perform set_config('app.stock_change_reason', 'dose_reverted', true);
      -- The row is about to disappear, so the ledger entry carries the actor
      -- and reason only; the FK would null this anyway.
      perform set_config('app.dose_log_id', '', true);

      update public.medicines
      set stock_on_hand = stock_on_hand + 1
      where id = v_medicine.id;
    end if;

    delete from public.dose_logs where id = v_log.id;

    perform set_config('app.stock_change_reason', '', true);
    return v_log.id;
  end if;

  if p_status = 'skipped' then
    if p_skip_reason is null
      or p_skip_reason not in ('forgot', 'out_of_stock', 'felt_unwell', 'doctor_advised') then
      raise exception 'INVALID_REASON';
    end if;
    v_reason := p_skip_reason::public.skip_reason;
    v_note := nullif(btrim(coalesce(p_skip_note, '')), '');
    if length(v_note) > 500 then
      raise exception 'NOTE_TOO_LONG';
    end if;
  else
    v_reason := null;
    v_note := null;
  end if;

  -- Same status: only a skipped reason/note may be edited.
  if p_status::public.dose_status = v_log.status then
    if p_status = 'skipped' then
      update public.dose_logs
      set skip_reason = v_reason,
          skip_note = v_note,
          last_modified_by = v_uid,
          updated_at = now()
      where id = v_log.id;
    end if;
    return v_log.id;
  end if;

  if v_log.status = 'taken' and p_status = 'skipped' then
    perform set_config('app.stock_change_reason', 'dose_reverted', true);
    perform set_config('app.dose_log_id', v_log.id::text, true);

    update public.medicines
    set stock_on_hand = stock_on_hand + 1
    where id = v_medicine.id;
  elsif v_log.status = 'skipped' and p_status = 'taken' then
    if v_medicine.stock_on_hand <= 0 then
      raise exception 'OUT_OF_STOCK';
    end if;

    perform set_config('app.stock_change_reason', 'dose_taken', true);
    perform set_config('app.dose_log_id', v_log.id::text, true);

    update public.medicines
    set stock_on_hand = stock_on_hand - 1
    where id = v_medicine.id;
  end if;

  update public.dose_logs
  set status = p_status::public.dose_status,
      skip_reason = v_reason,
      skip_note = v_note,
      last_modified_by = v_uid,
      updated_at = now()
  where id = v_log.id;

  perform set_config('app.dose_log_id', '', true);

  return v_log.id;
end;
$$;

revoke all on function public.update_dose_status(uuid, text, text, text) from public, anon;
grant execute on function public.update_dose_status(uuid, text, text, text) to authenticated;
