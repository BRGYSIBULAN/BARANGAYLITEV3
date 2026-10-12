/**
 * Purpose: lock the local least-privilege migration to the public browser contract.
 * Depends on: Node's test runner and the generated Supabase migration file.
 * Debug: compare a failed assertion with docs/DATA-API-GRANTS-AUDIT-2026-10-12.md.
 * Safety: this test reads SQL as text and never connects to or changes Supabase.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/20261012091925_restrict_anonymous_table_writes.sql', import.meta.url);
// Remove explanatory SQL comments so assertions inspect executable statements only.
const sql = (await readFile(migrationUrl, 'utf8')).replace(/--.*$/gm, '').replace(/\s+/g, ' ').toLowerCase();

const publicReadTables = Object.freeze([
  'announcements',
  'directory_entries',
  'disclosures',
  'forms',
  'gallery_items',
  'officials',
  'pages',
  'services',
  'site_settings',
]);

test('anonymous hardening preserves public reads but removes table writes', () => {
  assert.match(sql, /revoke all privileges on table .* from anon;/);
  assert.match(sql, /grant select on table .* to anon;/);
  for (const table of publicReadTables) assert.ok(sql.includes(`public.${table}`), `${table} must be handled explicitly`);
  assert.match(sql, /revoke all privileges on table public\.profiles from anon;/);
});

test('anonymous hardening does not alter required application or privileged roles', () => {
  // The public application INSERT remains untouched, and no privileged role can
  // accidentally be narrowed by this anonymous-only migration.
  assert.doesNotMatch(sql, /content_admin_applications/);
  assert.doesNotMatch(sql, /verification_records/);
  assert.doesNotMatch(sql, /from authenticated|to authenticated/);
  assert.doesNotMatch(sql, /from service_role|to service_role/);
});

