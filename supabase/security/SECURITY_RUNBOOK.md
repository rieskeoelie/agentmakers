# Supabase security runbook — public.users lockdown

Fixes the Supabase Security Advisor finding "Table publicly accessible" on `public.users`
(RLS disabled, `anon`/`authenticated` hold table privileges).

**Everything here is run manually in the Supabase SQL editor by an operator.
Nothing in this folder is applied automatically, and no deploy is required.**

## Background

- AgentMakers does not use Supabase Auth. Login is custom: scrypt hashes in `users.password_hash`
  plus an HMAC-signed `am_session` cookie (`src/lib/auth.ts`).
- All `public.users` access in the codebase goes through `supabaseAdmin` (`SUPABASE_SERVICE_ROLE_KEY`),
  server-side only. `service_role` bypasses RLS, so `anon`/`authenticated` need no access at all.
- `01` therefore enables RLS with **no policies** and revokes `anon`/`authenticated` privileges.
  Do not add `USING (true)` or other broad policies to silence the advisor.

## Files

| File | Purpose | Changes data/privileges? |
|---|---|---|
| `00_audit_readonly.sql` | Live state of every public table: RLS, policies, grants, column grants, functions, views, default privileges | No (read-only) |
| `01_users_lockdown.sql` | RLS on `public.users`, revoke `anon`/`authenticated`/`public`, keep `service_role` | Privileges only |
| `02_other_public_tables.sql` | `public.leads` + `public.page_views` only: drop the public INSERT policies (`"Public insert leads"`, `"Public insert page_views"`), revoke all anon/authenticated/public table, column and sequence privileges, keep `service_role` access and the `"Service role full access …"` policies. Does not touch RPCs, `landing_pages` or any other table | Privileges/policies only |
| `99_rollback_users.sql` | Emergency rollback of `01` (restores the current insecure state) | Privileges only |

## Order (follow exactly)

1. **Run `00_audit_readonly.sql`.** Save the output.
2. **Review the live findings.** Confirm `public.users` columns, every table with RLS off,
   every broad policy (`USING (true)`, `demo_token IS NOT NULL`, roles `{public}`/`{anon}`),
   anon/authenticated grants, and that `service_role` has `rolbypassrls = true`.
   Before continuing, confirm the production `SUPABASE_SERVICE_ROLE_KEY` (Vercel) is really the
   service-role key — if it were the anon key, step 3 would break login.
3. **Run `01_users_lockdown.sql`.**
4. **Verify `public.users` is inaccessible to `anon`/`authenticated`:**
   - The verification query at the end of `01` must show `rls_enabled = true`, all `anon_*`/`auth_*` = `false`,
     `service_role_select = true`.
   - `GET <SUPABASE_URL>/rest/v1/users?select=id` with the **anon** key must return 401/403 (permission denied).
   - In the app: log in at `/admin`, open Users (superadmin), create and delete a test partner, run a password reset.
   - If something unexpected breaks: run `99_rollback_users.sql`, investigate, re-apply `01` as soon as possible.
5. **Run `02_other_public_tables.sql` only after explicit approval** based on the live audit
   (only if those policies/grants actually exist live, and no external tool writes to `leads`/`page_views` with the anon key).
6. **Rerun the Supabase Security Advisor** and confirm the `public.users` finding is resolved;
   review any remaining findings.
7. **Rotate affected user passwords if exposure cannot be ruled out.** Check Supabase API logs for
   `/rest/v1/users` (and `/rest/v1/leads`) requests made with the anon role. If access cannot be excluded,
   reset the passwords of all users (superadmin via `/api/auth/set-password` or the reset flow).
8. **Rotate `SESSION_SECRET`** (Vercel env var, then redeploy when deployment is approved) to invalidate
   existing sessions. Sessions are stateless HMAC cookies, so password changes alone do not end them.
   This logs everyone out; outstanding password-reset links also become invalid.

## Notes

- `02` intentionally has no rollback: re-creating the public INSERT policies would re-open anonymous writes to `leads`/`page_views`.
- Changing Supabase default privileges for future objects in `public` is a separate decision; it is not part of this runbook.
