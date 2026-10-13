-- Purpose: make future postgres-owned public tables, functions, and sequences
-- opt-in for Data API access instead of inheriting broad browser privileges.
-- Depends on: Supabase's postgres owner role and the anon, authenticated, and
-- service_role roles used by the generated Data API.
-- Debug: inspect pg_default_acl for defaclrole = 'postgres' after deployment;
-- existing object grants must remain unchanged, then run npm run verify:live.
-- Safety: ALTER DEFAULT PRIVILEGES affects only objects created in the future.
-- It does not change current tables, functions, policies, records, Auth users,
-- Storage objects, ID numbers, QR tokens, or the permissions used by the app.
-- Rollback: restore the matching table, function, and sequence default grants
-- only if the project intentionally returns to automatic Data API exposure.

alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables
  from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke execute on functions
  from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke usage, select on sequences
  from anon, authenticated, service_role;

-- PUBLIC is separate from the named API roles. Revoking its future-function
-- default prevents a newly created SECURITY DEFINER function from becoming an
-- accidental endpoint before a reviewed explicit EXECUTE grant is added.
alter default privileges for role postgres in schema public
  revoke execute on functions
  from public;
