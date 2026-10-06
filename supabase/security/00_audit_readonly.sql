-- ════════════════════════════════════════════════════════════════════════════
-- 00 — READ-ONLY AUDIT. Run first in the Supabase SQL editor. Changes nothing.
-- The repo's supabase-schema.sql does NOT define public.users and is known to
-- differ from the live schema (e.g. leads.user_id), so confirm the live state
-- before applying 01/02.
-- ════════════════════════════════════════════════════════════════════════════

-- A. Every public table: RLS on/off, forced, number of policies
select c.relname                                   as table_name,
       c.relrowsecurity                            as rls_enabled,
       c.relforcerowsecurity                       as rls_forced,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = c.relname) as policy_count
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p')
order by c.relrowsecurity, c.relname;

-- B. Every policy in public (look for USING (true), qual NULL, or roles {public}/{anon})
select tablename, policyname, cmd, roles, permissive, qual as using_expr, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- C. Table privileges held by anon / authenticated
select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated')
group by table_name, grantee
order by table_name, grantee;

-- D. Column-level privileges held by anon / authenticated (not removed by REVOKE ... ON TABLE)
select table_name, column_name, grantee, privilege_type
from information_schema.column_privileges
where table_schema = 'public' and grantee in ('anon', 'authenticated')
order by table_name, column_name, grantee;

-- E. Columns of public.users (sensitivity check — values are NOT read)
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'users'
order by ordinal_position;

-- F. Functions in public executable by anon / authenticated
select p.oid::regprocedure as function_signature,
       has_function_privilege('anon', p.oid, 'execute')          as anon_exec,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_exec,
       p.prosecdef as security_definer
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by 1;

-- G. Views in public (views bypass RLS unless security_invoker is set)
select c.relname as view_name, c.reloptions
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('v', 'm');

-- H. Supabase default privileges for future tables/functions in public
select pg_get_userbyid(d.defaclrole) as owner, d.defaclobjtype as object_type, d.defaclacl as acl
from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
where n.nspname = 'public';

-- I. Does service_role really bypass RLS? (expected: true)
select rolname, rolbypassrls from pg_roles where rolname in ('service_role', 'anon', 'authenticated');
