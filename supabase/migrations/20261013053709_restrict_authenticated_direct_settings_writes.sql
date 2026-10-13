-- Purpose: remove direct signed-in writes from staff identity and global site
-- settings tables while preserving the exact reads used by the browser.
-- Depends on: profiles being managed by the protected manage-editors Edge
-- Function, and settings/design/cover/visibility writes using reviewed RPCs.
-- Debug: inspect information_schema.role_table_grants for authenticated, then
-- run npm test, npm run check, and npm run verify:live after deployment.
-- Safety: anon and service_role grants, RLS policies, RPC execution, table rows,
-- Auth accounts, IDs, QR tokens, Storage, and all other tables are unchanged.
-- Rollback: grant SELECT, INSERT, UPDATE, DELETE on these two tables to
-- authenticated only if a reviewed legacy direct-write client still needs them.

-- RLS remains a second boundary, but the browser role no longer receives write
-- permission that its current source code never exercises directly.
revoke all privileges on table
  public.profiles,
  public.site_settings
from authenticated;

-- Staff login and every settings workspace still require these reads.
grant select on table
  public.profiles,
  public.site_settings
to authenticated;
