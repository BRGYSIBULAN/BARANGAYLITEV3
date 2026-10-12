-- Purpose: reduce the anonymous Data API role to the read-only access used by
-- the public website, while keeping the separate application INSERT workflow.
-- Depends on: the existing public content tables, their enabled RLS policies,
-- and the current browser contract recorded in the 2026-10-12 grants audit.
-- Debug: inspect information_schema.role_table_grants for grantee = 'anon',
-- then run npm run verify:live after applying this migration to production.
-- Safety: authenticated and service_role privileges, table rows, policies,
-- functions, ID verification data, Auth accounts, and Storage are unchanged.
-- Rollback: grant SELECT, INSERT, UPDATE, DELETE on the listed tables to anon;
-- do not grant TRUNCATE, REFERENCES, or TRIGGER because the browser never needs them.

-- Remove the legacy default CRUD surface from tables that public visitors only
-- read. RLS remains the row-level boundary; this grant layer is defense in depth.
revoke all privileges on table
  public.announcements,
  public.directory_entries,
  public.disclosures,
  public.forms,
  public.gallery_items,
  public.officials,
  public.pages,
  public.services,
  public.site_settings
from anon;

-- Restore only the public reads exercised by the current website. Each table's
-- existing RLS policy still limits the result to published or active rows.
grant select on table
  public.announcements,
  public.directory_entries,
  public.disclosures,
  public.forms,
  public.gallery_items,
  public.officials,
  public.pages,
  public.services,
  public.site_settings
to anon;

-- Profiles have no anonymous browser use. Removing the grant complements the
-- current RLS denial so a later policy mistake cannot expose staff identities.
revoke all privileges on table public.profiles from anon;

-- Intentionally untouched: anon INSERT on content_admin_applications and EXECUTE
-- on the reviewed public RPCs remain required by existing application flows.
