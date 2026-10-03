/**
 * Purpose: verify protected ID name searches and live result request ordering.
 * Depends on: Node tests, linkedom, and fake services; no resident data or live writes.
 * Debug: inspect recorded filters and deferred results when a search assertion fails.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { createVerification } from '../assets/js/data/verification.js';
import { mountContent } from '../assets/js/staff/content-screen.js';

test('ID search applies name words across fields, status, bounds, and protected access', async () => {
  const steps = [], query = {};
  for (const method of ['select', 'or', 'eq', 'order', 'range']) query[method] = (...args) => { steps.push([method, ...args]); return query; };
  query.then = resolve => resolve({ data: [], count: 0 });
  const service = createVerification({ from: table => { steps.push(['from', table]); return query; } }, {
    requirePermission: async permission => steps.push(['permission', permission]),
  });
  await service.list({ search: '  Santos   Ana ', status: 'ACTIVE', page: 2, pageSize: 20 });
  assert.deepEqual(steps[0], ['permission', 'verification']);
  const filters = steps.filter(([method]) => method === 'or').map(([, value]) => value);
  assert.equal(filters.length, 2);
  for (const [index, word] of ['Santos', 'Ana'].entries()) {
    for (const field of ['control_number', 'first_name', 'middle_name', 'last_name', 'designation']) assert.ok(filters[index].includes(`${field}.ilike."%${word}%"`));
  }
  assert.ok(steps.some(step => JSON.stringify(step) === JSON.stringify(['eq', 'status', 'ACTIVE'])));
  assert.deepEqual(steps.at(-1), ['range', 40, 59]);
  steps.length = 0;
  await service.list({ search: '   ' });
  assert.equal(steps.some(([method]) => method === 'or'), false);
  // A denied caller must never reach the private table, including for type-ahead searches.
  const denied = createVerification({ from() { assert.fail('Private query was attempted'); } }, { requirePermission: async () => { throw new Error('denied'); } });
  await assert.rejects(denied.list({ search: 'Ana' }), /denied/);
});

test('ID search quotes filter punctuation and escapes wildcard characters', async () => {
  let filter;
  const query = { select() { return this; }, or(value) { filter = value; return this; }, order() { return this; }, range: async () => ({ data: [] }) };
  const service = createVerification({ from: () => query }, { requirePermission: async () => {} });
  await service.list({ search: 'a,b)("\\%_*' });
  // Decode the operand to verify punctuation remains inside a quoted value.
  const first = filter.slice('control_number.ilike.'.length, filter.indexOf(',first_name.ilike.'));
  assert.equal(JSON.parse(first), '%a,b)("' + '\\'.repeat(3) + '%' + '\\_' + '\\*%');
});

test('live ID search debounces, ignores old results, supports Enter/filter/clear, and disposes timers', async () => {
  const { window } = parseHTML('<html><body><main></main></body></html>');
  globalThis.document = window.document; globalThis.Node = window.Node;
  Object.defineProperty(window.HTMLSelectElement.prototype, 'value', {
    configurable: true,
    get() { return this.querySelector('option[selected]')?.value || 'all'; },
    set(value) { for (const option of this.options) option.toggleAttribute('selected', option.value === value); },
  });
  const pending = [], root = document.querySelector('main');
  const cleanup = mountContent(root, 'verification', { verification: { list: options => new Promise(resolve => pending.push({ options, resolve })) } }, () => true);
  const search = root.querySelector('input[type=search]');
  const tick = () => new Promise(resolve => setImmediate(resolve));
  const type = value => { search.value = value; search.dispatchEvent(new window.Event('input')); };
  try {
    type('An'); type('Ana');
    assert.equal(pending.length, 1);
    pending[0].resolve({ rows: [{ id: 'old', control_number: 'OLD-RESULT' }], count: 1 });
    await tick();
    assert.equal(root.textContent.includes('OLD-RESULT'), false);
    await new Promise(resolve => setTimeout(resolve, 350));
    assert.equal(pending.length, 2);
    assert.equal(pending[1].options.search, 'Ana');
    type('Santos');
    root.querySelector('form').dispatchEvent(new window.Event('submit', { cancelable: true }));
    assert.equal(pending[2].options.search, 'Santos');
    pending[2].resolve({ rows: [{ id: 'new', control_number: 'TEST-002', first_name: 'Ana', last_name: 'Santos', status: 'ACTIVE' }], count: 1 });
    await tick();
    pending[1].resolve({ rows: [{ id: 'stale', control_number: 'STALE-RESULT' }], count: 1 });
    await tick();
    assert.match(root.textContent, /Ana Santos/);
    assert.equal(root.textContent.includes('STALE-RESULT'), false);
    const filter = root.querySelector('select'); filter.value = 'INACTIVE';
    filter.dispatchEvent(new window.Event('change'));
    assert.equal(pending[3].options.status, 'INACTIVE');
    assert.equal(pending[3].options.page, 0);
    pending[3].resolve({ rows: [], count: 0 }); await tick();
    assert.match(root.textContent, /Try fewer name words/);
    type('Pending');
    [...root.querySelectorAll('button')].find(node => node.textContent === 'Clear filters').click();
    assert.equal(pending[4].options.search, '');
    assert.equal(pending[4].options.status, 'all');
    type('Disposed'); cleanup();
    await new Promise(resolve => setTimeout(resolve, 350));
    assert.equal(pending.length, 5);
  } finally { cleanup(); }
});
