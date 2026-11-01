/**
 * Purpose: verify Remember me token lifetimes, safe migration, and the admin login control.
 * Depends on: Node test runner, in-memory storage, and a local DOM; never uses real credentials.
 * Debug: failures identify a session left in the wrong store or an unintended legacy-key change.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { createSessionStore } from '../assets/js/core/session-storage.js';
import { accessSurface } from '../assets/js/design/access-renderer.js';

/** Match the browser Storage API closely enough to exercise enumeration and namespace isolation. */
function storage() {
  const entries = new Map();
  return { get length() { return entries.size; }, key: i => [...entries.keys()][i] ?? null,
    getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, String(value)), removeItem: key => entries.delete(key) };
}

test('unchecked sessions survive navigation in the same tab but not a new browser session', () => {
  const persistent = storage(), temporary = storage();
  const first = createSessionStore({ key: 'test-v3', persistent, temporary });
  assert.equal(first.remember(), false);
  first.setRemember(false); first.setItem('test-v3', 'synthetic-session');
  assert.equal(persistent.getItem('test-v3'), null);
  assert.equal(createSessionStore({ key: 'test-v3', persistent, temporary }).getItem('test-v3'), 'synthetic-session');
  assert.equal(createSessionStore({ key: 'test-v3', persistent, temporary: storage() }).getItem('test-v3'), null);
});

test('remembered sessions survive reopening and switching off removes only V3 persistent auth', () => {
  const persistent = storage(), temporary = storage();
  persistent.setItem('legacy-auth', 'synthetic-legacy');
  const first = createSessionStore({ key: 'test-v3', persistent, temporary });
  first.setRemember(true); first.setItem('test-v3', 'synthetic-session'); first.setItem('test-v3-code-verifier', 'synthetic-pkce');
  assert.equal(temporary.getItem('test-v3'), null);
  const reopened = createSessionStore({ key: 'test-v3', persistent, temporary: storage() });
  assert.equal(reopened.getItem('test-v3'), 'synthetic-session');
  reopened.setRemember(false);
  assert.equal(persistent.getItem('test-v3'), null);
  assert.equal(persistent.getItem('test-v3-code-verifier'), null);
  assert.equal(reopened.getItem('test-v3'), 'synthetic-session');
  assert.equal(reopened.getItem('test-v3-code-verifier'), 'synthetic-pkce');
  assert.equal(persistent.getItem('legacy-auth'), 'synthetic-legacy');
  reopened.removeItem('test-v3');
  assert.equal(reopened.getItem('test-v3'), null);
});

test('legacy persistent V3 sessions remain remembered and unavailable storage gives an actionable error', () => {
  const persistent = storage(); persistent.setItem('test-v3', 'synthetic-session');
  assert.equal(createSessionStore({ key: 'test-v3', persistent, temporary: storage() }).remember(), true);
  assert.throws(() => createSessionStore({ key: 'test-v3', temporary: storage() }).setRemember(true), /requires browser storage/);
  assert.throws(() => createSessionStore({ key: 'test-v3' }).setRemember(false), /session storage is unavailable/);
});

test('BRGYSI login has labeled password and Remember me controls; preview accepts no input', () => {
  const previous = globalThis.document;
  const { document } = parseHTML('<html><body></body></html>'); globalThis.document = document;
  try {
    const live = accessSurface('login');
    assert.equal(live.querySelector('h1').textContent, 'BRGYSI Admin Panel');
    assert.equal(live.querySelector('input[name=password]').type, 'password');
    const remember = live.querySelector('input[name=remember]');
    assert.equal(remember.type, 'checkbox');
    assert.equal(remember.hasAttribute('checked'), false);
    assert.ok(live.querySelector(`label[for="${remember.id}"]`));
    const preview = accessSurface('login', {}, { preview: true });
    assert.equal([...preview.querySelectorAll('input,button')].every(node => node.disabled), true);
  } finally { globalThis.document = previous; }
});
