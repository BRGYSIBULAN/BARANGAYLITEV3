/**
 * Purpose: verify existing table/column connectivity and anonymous-access restrictions.
 * Depends on: the public Supabase configuration, current network access, and pinned SDK URL.
 * Debug: each PASS/error names the exact contract or protected table being checked.
 * Safety: reads only; no login mutation, record write, file mutation, or private-data logging.
 */
import assert from 'node:assert/strict';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SDK_VERSION } from '../assets/js/core/config.js';
import { CONTENT, SETTINGS_SELECT } from '../assets/js/data/contracts.js';

const headers = { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' };
/** Use the public key only; never add admin credentials to make a failed check pass. */
async function get(route) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${route}`, { headers, signal: AbortSignal.timeout(20000) });
  return { ok: response.ok, status: response.status, data: await response.json() };
}
/** RPC reads use POST but call only stable/list functions; this verifier never calls a write RPC. */
async function rpc(name, body) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  return { ok: response.ok, status: response.status, data: await response.json() };
}
const settings = await get(`site_settings?select=${SETTINGS_SELECT}&id=eq.1`);
assert.equal(settings.ok, true, `site_settings HTTP ${settings.status}`);
assert.equal(settings.data.length, 1, 'Expected existing singleton settings row');
console.log('PASS: existing site_settings singleton readable; no theme fields requested.');
const theme = await get('site_settings?select=id,design_theme,updated_at&id=eq.1');
assert.equal(theme.ok, true, 'Existing design_theme column must be publicly readable');
assert.equal(theme.data.length, 1);
// Exercise the exact read-side comparison syntax used for atomic publishing, without PATCH.
const rawTheme = theme.data[0].design_theme;
const comparison = rawTheme === null ? 'is.null' : 'eq.' + encodeURIComponent(JSON.stringify(rawTheme));
const compared = await get('site_settings?select=id&id=eq.1&design_theme=' + comparison);
assert.equal(compared.ok, true, 'Theme baseline comparison must be supported by PostgREST');
assert.equal(compared.data.length, 1);
console.log('PASS: existing theme column and atomic baseline comparison readable; no theme write performed.');
for (const [table, def] of Object.entries(CONTENT)) {
  const result = await get(`${table}?select=id,${def.fields.join(',')}&${def.flag}=eq.true&limit=1`);
  assert.equal(result.ok, true, `${table} HTTP ${result.status}`);
  assert.ok(Array.isArray(result.data));
  console.log(`PASS: ${table} existing column contract and public read access.`);
  // Ask for unpublished rows explicitly; filtering only published rows cannot prove RLS isolation.
  const hidden = await get(`${table}?select=id&${def.flag}=eq.false&limit=1`);
  assert.ok([401, 403].includes(hidden.status) || (hidden.ok && Array.isArray(hidden.data) && hidden.data.length === 0), `Anonymous access exposed unpublished ${table}`);
  console.log(`PASS: anonymous caller cannot read unpublished ${table}.`);
}
for (const section of ['officials', 'staff', 'functionaries']) {
  const result = await rpc('list_public_directory_records', { p_section: section, p_offset: 0, p_limit: 1, p_excluded_subcategories: [] });
  assert.equal(result.ok, true, `public Directory ${section} HTTP ${result.status}`);
  assert.ok(Array.isArray(result.data));
  for (const row of result.data) {
    for (const privateField of ['control_number', 'qr_token', 'date_acquired', 'expiration_date', 'first_name', 'last_name']) assert.equal(Object.hasOwn(row, privateField), false, `Public Directory exposed ${privateField}`);
  }
}
console.log('PASS: public Directory RPC returns only approved published display fields.');
const deniedDirectory = await rpc('staff_list_directory_records', { p_section: 'staff', p_view: 'section', p_search: '', p_offset: 0, p_limit: 1 });
assert.ok([401, 403].includes(deniedDirectory.status), `Anonymous staff Directory RPC must be denied, got HTTP ${deniedDirectory.status}`);
console.log('PASS: anonymous caller cannot execute staff Directory listing.');
// Both a denied request and an empty RLS-filtered response are safe for anonymous users.
for (const table of ['profiles', 'verification_records', 'verification_record_history', 'content_admin_applications', 'staff_delegated_permissions', 'staff_activity_logs', 'activity_log_deletions']) {
  const result = await get(`${table}?select=*&limit=1`);
  assert.ok([401, 403].includes(result.status) || (result.ok && Array.isArray(result.data) && result.data.length === 0), `Anonymous access must not expose ${table}`);
  console.log(`PASS: anonymous ${table} access returns no private rows.`);
}
const sdk = await fetch(`https://cdn.jsdelivr.net/npm/@supabase/supabase-js@${SDK_VERSION}/dist/umd/supabase.js`, { signal: AbortSignal.timeout(20000) });
assert.equal(sdk.ok, true, `Pinned SDK HTTP ${sdk.status}`);
assert.ok((await sdk.text()).length > 10000, 'Expected browser SDK bundle');
console.log(`PASS: pinned Supabase SDK ${SDK_VERSION} is available.`);
console.log('Live read-only verification passed. No passwords requested and no live records changed.');
