/**
 * Purpose: lock signed-in direct access to the two read-only browser tables.
 * Depends on: Node's test runner and the generated Supabase migration file.
 * Debug: compare failures with assets/js/core/auth.js and the settings services.
 * Safety: this test reads SQL as text and never connects to Supabase.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/20261013053709_restrict_authenticated_direct_settings_writes.sql', import.meta.url);
// Remove comments so rollback guidance cannot accidentally satisfy assertions.
const sql = (await readFile(migrationUrl, 'utf8')).replace(/--.*$/gm, '').replace(/\s+/g, ' ').toLowerCase();

test('authenticated keeps reads but loses unused direct settings writes', () => {
  assert.match(sql, /revoke all privileges on table public\.profiles, public\.site_settings from authenticated;/);
  assert.match(sql, /grant select on table public\.profiles, public\.site_settings to authenticated;/);
});

test('settings grant migration cannot alter data, RLS, RPCs, or other roles', () => {
  assert.doesNotMatch(sql, /\b(?:insert\s+into|delete\s+from|update\s+(?:public\.)?[a-z_][a-z0-9_]*)\b/);
  assert.doesNotMatch(sql, /\b(?:alter|drop|truncate)\s+table\b/);
  assert.doesNotMatch(sql, /\b(?:create|alter|drop)\s+(?:policy|function)\b/);
  assert.doesNotMatch(sql, /\b(?:from|to)\s+(?:anon|service_role|public)\b/);
});
