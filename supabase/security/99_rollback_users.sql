-- ════════════════════════════════════════════════════════════════════════════
-- 99 — Emergency rollback for 01 (restores the CURRENT insecure state).
-- Only for the case that something unexpected breaks; the codebase analysis
-- found no code path that would. Re-apply 01 as soon as the cause is fixed.
-- ════════════════════════════════════════════════════════════════════════════
begin;
alter table public.users disable row level security;
grant select, insert, update, delete on table public.users to anon, authenticated;
notify pgrst, 'reload schema';
commit;

-- Rollback for 02 is intentionally not provided: re-creating
-- "Public read lead by token" would re-expose all demo leads' personal data.
