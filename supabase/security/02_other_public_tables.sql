-- ════════════════════════════════════════════════════════════════════════════
-- 02 — public.leads + public.page_views hardening (PROPOSED — NOT APPLIED)
--
-- Matches the confirmed live production state:
--   * leads:      "Public insert leads"       INSERT WITH CHECK (true)
--                 "Service role full access leads"  ALL auth.role() = 'service_role'
--   * page_views: "Public insert page_views"  INSERT WITH CHECK (true)
--                 "Service role full access views"  ALL auth.role() = 'service_role'
--   * anon/authenticated hold broad table privileges on both tables.
--
-- The application writes/reads leads and page_views ONLY via supabaseAdmin
-- (service_role, server-side): /api/leads, /api/track and the admin routes.
-- The public insert policies are therefore unused, and let anyone holding the
-- anon key insert arbitrary rows (spam / fake leads attributed to any user_id).
--
-- Scope: only public.leads and public.page_views. landing_pages and all other
-- tables are untouched. The "Service role full access …" policies are kept.
-- Idempotent and transactional. Changes no data.
-- ════════════════════════════════════════════════════════════════════════════
begin;

-- 1. Drop the broad anon insert policies.
drop policy if exists "Public insert leads"      on public.leads;
drop policy if exists "Public insert page_views" on public.page_views;

-- 2. RLS stays on (no-op if already enabled).
alter table public.leads      enable row level security;
alter table public.page_views enable row level security;

-- 3. Remove direct table privileges from anon / authenticated (and PUBLIC).
revoke all on table public.leads      from anon, authenticated, public;
revoke all on table public.page_views from anon, authenticated, public;

-- 4. Remove any column-level grants (REVOKE ... ON TABLE does not remove them).
do $$
declare col record;
begin
  for col in
    select table_name, column_name from information_schema.columns
    where table_schema = 'public' and table_name in ('leads', 'page_views')
  loop
    execute format('revoke all (%I) on table public.%I from anon, authenticated, public', col.column_name, col.table_name);
  end loop;
end $$;

-- 5. Sequences owned by these tables (only if an id is serial/identity; harmless otherwise).
do $$
declare s record;
begin
  for s in
    select seq.oid::regclass as seq
    from pg_class seq
    join pg_depend d on d.objid = seq.oid and d.deptype in ('a', 'i')
    join pg_class t on t.oid = d.refobjid
    join pg_namespace n on n.oid = t.relnamespace
    where seq.relkind = 'S' and n.nspname = 'public' and t.relname in ('leads', 'page_views')
  loop
    execute format('revoke all on sequence %s from anon, authenticated, public', s.seq);
  end loop;
end $$;

-- 6. Server-side access stays exactly as today (grant is additive; nothing is revoked from service_role).
grant select, insert, update, delete on table public.leads      to service_role;
grant select, insert, update, delete on table public.page_views to service_role;

-- 7. Make PostgREST pick up the privilege change immediately.
notify pgrst, 'reload schema';

commit;

-- ─── Verification (read-only; run after applying) ───────────────────────────

-- V1. RLS state — expected: rls_enabled = true for both
select c.relname as table_name, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('leads', 'page_views')
order by c.relname;

-- V2. Privileges — expected: every anon/authenticated column = false, every service_role column = true
select t.tbl as table_name, r.role,
       has_table_privilege(r.role, 'public.' || t.tbl, 'insert') as can_insert,
       has_table_privilege(r.role, 'public.' || t.tbl, 'select') as can_select,
       has_table_privilege(r.role, 'public.' || t.tbl, 'update') as can_update,
       has_table_privilege(r.role, 'public.' || t.tbl, 'delete') as can_delete
from (values ('leads'), ('page_views')) as t(tbl)
cross join (values ('anon'), ('authenticated'), ('service_role')) as r(role)
order by t.tbl, r.role;

-- V3. Leftover column-level grants for anon/authenticated — expected: no rows
select table_name, column_name, grantee, privilege_type
from information_schema.column_privileges
where table_schema = 'public' and table_name in ('leads', 'page_views')
  and grantee in ('anon', 'authenticated')
order by table_name, column_name, grantee;

-- V4. Remaining policies — expected: only "Service role full access leads" and "Service role full access views"
select tablename, policyname, cmd, roles, qual as using_expr, with_check
from pg_policies
where schemaname = 'public' and tablename in ('leads', 'page_views')
order by tablename, policyname;

-- External check (anon key): POST <SUPABASE_URL>/rest/v1/leads with apikey=<anon key>
-- → expected 401/403 "permission denied for table leads".
-- App check: submit the landing-page lead form and open a landing page (page view tracking);
-- both must still work (they insert via service_role).
