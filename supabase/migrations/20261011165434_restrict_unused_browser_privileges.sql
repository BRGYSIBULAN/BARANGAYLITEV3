-- Purpose: remove browser privileges for whole-table and schema operations.
-- Depends on: existing public tables and the anon/authenticated browser roles.
-- Debug: inspect effective table privileges; ordinary CRUD and RLS are unchanged.
-- TRUNCATE bypasses RLS. REFERENCES/TRIGGER are for schema maintenance, not the UI.
-- This does not drop triggers, change rows, rotate QR tokens, alter RPCs, or affect service_role.
revoke truncate, references, trigger on table
  public.announcements, public.directory_entries, public.disclosures,
  public.forms, public.gallery_items, public.officials, public.pages,
  public.profiles, public.services, public.site_settings,
  public.verification_records
from anon, authenticated;
