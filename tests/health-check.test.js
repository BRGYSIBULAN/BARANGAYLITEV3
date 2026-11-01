/**
 * Purpose: verify that health checks detect database failures and keep notifications operational-only.
 * Depends on: Node test runner and injected HTTP responses; no production requests or messages.
 * Debug: failures identify an HTTP, response-contract, or notification destination boundary.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkDatabase, notify } from '../scripts/health-check.mjs';

test('database health requires the public singleton and does not write records', async () => {
  await checkDatabase(async (url, options) => {
    assert.match(url, /\/rest\/v1\/site_settings\?select=id&id=eq\.1&limit=1$/);
    assert.equal(options.method, undefined);
    assert.equal(options.body, undefined);
    return { ok: true, json: async () => [{ id: 1 }] };
  });
  await assert.rejects(checkDatabase(async () => ({ ok: false, status: 503 })), /Database HTTP 503/);
  for (const data of [[], {}, [{ id: 2 }]]) {
    await assert.rejects(checkDatabase(async () => ({ ok: true, json: async () => data })), /singleton/);
  }
  await assert.rejects(checkDatabase(async () => { throw new Error('network unavailable'); }), /network unavailable/);
});

test('notifications are optional, validate destination, and reject delivery failures', async () => {
  assert.equal(await notify('operational test'), false);
  await assert.rejects(notify('operational test', { topic: '../invalid' }), /Invalid ntfy/);
  const options = { topic: 'synthetic_test_topic_12345', fetcher: async (url, init) => {
    assert.equal(new URL(url).hostname, 'ntfy.sh');
    assert.equal(init.method, 'POST');
    assert.equal(init.body, 'operational test');
    assert.equal(init.redirect, 'error');
    assert.equal(Object.hasOwn(init.headers, 'apikey'), false);
    return { ok: true };
  } };
  assert.equal(await notify('operational test', options), true);
  await assert.rejects(notify('operational test', { ...options, fetcher: async () => ({ ok: false, status: 429 }) }), /Notification HTTP 429/);
});
