-- Enum values for the three-role + AI plan (docs/three-role-ai-plan.md, §4).
--
-- This file contains VALUES ONLY. Postgres refuses to use a new enum value in
-- the transaction that adds it, and Supabase wraps each migration file in one
-- transaction, so nothing here may reference 'patient', 'disposed' or
-- 'dispose_reverted'. Every use of them belongs in a later migration
-- (20261125000700_* and beyond).
--
-- IF NOT EXISTS keeps a retried or partially applied push safe.
--
-- Scope: adds three labels. No grants, no policies, no RPCs, no data changes.

-- A third household role. Existing memberships are untouched.
alter type public.household_role add value if not exists 'patient';

-- Disposal paths. 'disposed' is written when stock is discarded; the ledger
-- needs a dedicated label because it is neither a restock nor an owner edit.
alter type public.stock_change_reason add value if not exists 'disposed';

-- Inline undo of a disposal restores the discarded quantity; recorded so the
-- compensating ledger row is distinguishable from a manual restock.
alter type public.stock_change_reason add value if not exists 'dispose_reverted';
