-- ════════════════════════════════════════════════════════════════════════════
-- 01 — public.users lockdown (PROPOSED — NOT APPLIED)
--
-- Why this is safe for AgentMakers:
--   * The app does NOT use Supabase Auth. Login is custom (scrypt hash in
--     users.password_hash + HMAC-signed am_session cookie, src/lib/auth.ts).
--   * Every users-table access in the codebase (11 call sites, 7 route files)
--     goes through supabaseAdmin = SUPABASE_SERVICE_ROLE_KEY, server-side only.
--   * service_role has BYPASSRLS, so RLS with no policies does not affect it.
--   * The anon client (`supabase` in src/lib/supabase.ts) is never imported.
--   => anon and authenticated need NO access to public.users. No policies are
--      created on purpose: deny-by-default for every non-service role.
--
-- Idempotent and transactional. Changes no data.
-- ════════════════════════════════════════════════════════════════════════════
begin;

-- 1. Enable RLS (no policies => anon/authenticated see and change nothing).
alter table public.users enable row level security;

-- 2. Remove direct privileges (defence in depth; RLS alone would still allow
--    e.g. TRUNCATE/REFERENCES/TRIGGER, which RLS does not govern).
revoke all on table public.users from anon, authenticated, public;

-- 3. Remove any column-level grants (REVOKE ... ON TABLE does not remove them).
do $$
declare col record;
begin
  for col in
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'users'
  loop
    execute format('revoke all (%I) on table public.users from anon, authenticated, public', col.column_name);
  end loop;
end $$;

-- 4. Sequences owned by users (only if id is serial/identity; harmless otherwise).
do $$
declare s record;
begin
  for s in
    select seq.oid::regclass as seq
    from pg_class seq
    join pg_depend d on d.objid = seq.oid and d.deptype in ('a', 'i')
    join pg_class t on t.oid = d.refobjid
    join pg_namespace n on n.oid = t.relnamespace
    where seq.relkind = 'S' and n.nspname = 'public' and t.relname = 'users'
  loop
    execute format('revoke all on sequence %s from anon, authenticated, public', s.seq);
  end loop;
end $$;

-- 5. Server-side access stays exactly as today.
grant select, insert, update, delete on table public.users to service_role;

-- 6. Make PostgREST pick up the privilege change immediately.
notify pgrst, 'reload schema';

commit;

-- ─── Verification (read-only; run after applying) ───────────────────────────
-- expected: rls_enabled = true, every has_* = false
select c.relrowsecurity as rls_enabled,
       has_table_privilege('anon', 'public.users', 'select')          as anon_select,
       has_table_privilege('anon', 'public.users', 'update')          as anon_update,
       has_table_privilege('authenticated', 'public.users', 'select') as auth_select,
       has_table_privilege('authenticated', 'public.users', 'update') as auth_update,
       has_table_privilege('service_role', 'public.users', 'select')  as service_role_select  -- expected: true
from pg_class c where c.oid = 'public.users'::regclass;
-- External check (anon key, from any machine): GET <SUPABASE_URL>/rest/v1/users?select=id
-- with apikey=<anon key> → expected 401/403 "permission denied for table users".
-- App check: log in at /admin, open Users (superadmin), create/disable a test partner, reset password.
