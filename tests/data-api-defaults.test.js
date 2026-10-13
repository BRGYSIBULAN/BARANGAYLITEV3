/**
 * Purpose: lock the future-object Data API defaults to Supabase's opt-in model.
 * Depends on: Node's test runner and the generated Supabase migration file.
 * Debug: compare failures with the official Data API security guide and confirm
 * that the migration uses ALTER DEFAULT PRIVILEGES, not current-object REVOKEs.
 * Safety: this test reads SQL as text and never connects to Supabase.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/20261013040827_opt_in_explicit_data_api_grants.sql', import.meta.url);
// Strip comments so documentation and rollback guidance cannot satisfy a SQL assertion.
const sql = (await readFile(migrationUrl, 'utf8')).replace(/--.*$/gm, '').replace(/\s+/g, ' ').toLowerCase();

test('future postgres-owned Data API objects require reviewed explicit grants', () => {
  assert.match(sql, /alter default privileges for role postgres in schema public revoke select, insert, update, delete on tables from anon, authenticated, service_role;/);
  assert.match(sql, /alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated, service_role;/);
  assert.match(sql, /alter default privileges for role postgres in schema public revoke usage, select on sequences from anon, authenticated, service_role;/);
  assert.match(sql, /alter default privileges for role postgres in schema public revoke execute on functions from public;/);
});

test('future-default migration cannot change current objects or stored data', () => {
  assert.doesNotMatch(sql, /\b(?:alter|drop|truncate)\s+table\b/);
  // UPDATE appears legitimately in the revoked privilege list, so only match
  // UPDATE when it is followed by a table identifier like a data statement.
  assert.doesNotMatch(sql, /\b(?:insert\s+into|delete\s+from|update\s+(?:public\.)?[a-z_][a-z0-9_]*)\b/);
  assert.doesNotMatch(sql, /\brevoke\b[^;]*\bon\s+table\s+public\./);
  assert.doesNotMatch(sql, /\brevoke\b[^;]*\bon\s+function\s+public\./);
});
