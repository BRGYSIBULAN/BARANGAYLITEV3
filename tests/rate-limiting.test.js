/**
 * Purpose: lock the public RPC rate-limit migration to its privacy and compatibility promises.
 * Depends on: the authored SQL migration only; it never calls or changes the live database.
 * Debug: a failure names the missing endpoint, HTTP response contract, or privilege safeguard.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL('../supabase/migrations/20261012114504_public_rate_limiting.sql', import.meta.url);
const sql = await readFile(migrationUrl, 'utf8');
const hardeningUrl = new URL('../supabase/migrations/20261012114649_harden_rate_limit_fingerprint.sql', import.meta.url);
const hardeningSql = await readFile(hardeningUrl, 'utf8');

test('rate-limit counters are private, RLS-protected, hashed, and short-lived', () => {
  assert.match(sql, /create table if not exists private\.public_rate_limits/i);
  assert.match(sql, /alter table private\.public_rate_limits enable row level security/i);
  assert.match(sql, /revoke all on table private\.public_rate_limits from public, anon, authenticated, service_role/i);
  assert.match(sql, /extensions\.digest\([\s\S]*'sha256'/i);
  assert.doesNotMatch(sql, /\bip\s+inet\b/i);
  assert.match(sql, /updated_at < v_now - interval '2 days'/i);
});

test('effective fingerprint is IP-only so changing user-agent cannot bypass it', () => {
  assert.match(hardeningSql, /current_setting\('request\.headers', true\)/i);
  assert.match(hardeningSql, /v_headers ->> 'x-forwarded-for'/i);
  assert.match(hardeningSql, /extensions\.digest\(coalesce\(v_client_ip, 'unknown'\), 'sha256'\)/i);
  assert.doesNotMatch(hardeningSql, /v_headers\s*->>\s*'user-agent'/i);
  assert.doesNotMatch(hardeningSql, /v_user_agent/i);
  assert.doesNotMatch(hardeningSql, /\bip\s+inet\b/i);
});

test('only the four intended public RPC flows consume fixed server-owned limits', () => {
  const expected = [
    ["verification.manual", 15, "10 minutes"],
    ["verification.qr", 120, "10 minutes"],
    ["application.eligibility", 8, "1 hour"],
    ["metrics.public", 300, "10 minutes"],
  ];
  for (const [endpoint, limit, window] of expected) {
    assert.match(sql, new RegExp(`when '${endpoint.replace('.', '\\.')}' then\\s+v_limit := ${limit};\\s+v_window := interval '${window}'`, 'i'));
    assert.match(sql, new RegExp(`enforce_public_rate_limit\\('${endpoint.replace('.', '\\.')}'\\)`, 'i'));
  }
  assert.doesNotMatch(sql, /alter role authenticator/i);
});

test('the limiter is atomic and returns a standards-friendly 429 response', () => {
  assert.match(sql, /on conflict \(endpoint, client_fingerprint\) do update/i);
  assert.match(sql, /raise sqlstate 'PGRST'/i);
  assert.match(sql, /'code', 'RATE_LIMITED'/i);
  assert.match(sql, /'status', 429/i);
  assert.match(sql, /'Retry-After'/i);
});

test('existing verification signatures, QR tokens, and public grants remain compatible', () => {
  assert.match(sql, /function public\.verify_barangay_record\(\s*p_control_number text,\s*p_last_name text\s*\)/i);
  assert.match(sql, /function public\.verify_barangay_record_qr\(p_token text\)/i);
  assert.match(sql, /lookup_record_by_qr\(trim\(p_token\)::uuid\)/i);
  assert.match(sql, /grant execute on function public\.verify_barangay_record\(text, text\)[\s\S]*to anon, authenticated, service_role/i);
  assert.match(sql, /grant execute on function public\.verify_barangay_record_qr\(text\)[\s\S]*to anon, authenticated, service_role/i);
  assert.doesNotMatch(sql, /\b(?:delete|update)\s+from\s+(?:public\.)?verification_records\b/i);
});
