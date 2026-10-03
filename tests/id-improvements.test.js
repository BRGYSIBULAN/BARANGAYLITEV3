/**
 * Purpose: guard ID duplicate warnings, namesake confirmation, and validity filters.
 * Depends on: Node tests and mocked database requests; no production records are used.
 * Debug: inspect the recorded query sequence when a save or date predicate differs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createVerification } from '../assets/js/data/verification.js';
import { verificationDate } from '../assets/js/data/id-model.js';

/** Queue results so duplicate checks and writes can be distinguished without a database. */
function setup(results = []) {
  const calls = [];
  const client = { from(table) {
    const steps = []; calls.push({ table, steps });
    const query = {};
    for (const method of ['select', 'eq', 'neq', 'ilike', 'or', 'order', 'range', 'limit', 'single', 'insert', 'update', 'gte', 'lte']) {
      query[method] = (...args) => { steps.push([method, ...args]); return query; };
    }
    query.then = (resolve, reject) => Promise.resolve(results.shift() || { data: [], count: 0 }).then(resolve, reject);
    return query;
  } };
  return { calls, service: createVerification(client, { requirePermission: async permission => assert.equal(permission, 'verification') }) };
}
const person = { control_number: 'TEST-NEW', first_name: 'Example', middle_name: null, last_name: 'Resident' };
const writes = calls => calls.flatMap(call => call.steps).filter(([name]) => ['insert', 'update'].includes(name));

test('duplicate ID blocks creation even when a same-name override is supplied', async () => {
  const { service, calls } = setup([{ data: [{ id: 1, control_number: 'TEST-NEW' }] }]);
  await assert.rejects(service.save(person, null, { allowSameName: true }), /ID number already exists/);
  assert.equal(writes(calls).length, 0);
});

test('same full name warns before writing, but an explicit namesake decision can save', async () => {
  const { service, calls } = setup([{ data: [] }, { data: [{ id: 1, control_number: 'TEST-OLD' }] }, { data: [] }, { data: { id: 2 } }]);
  await assert.rejects(service.save(person), error => error.code === 'DUPLICATE_ID_NAME' && error.message.includes('TEST-OLD'));
  assert.equal(writes(calls).length, 0);
  assert.ok(calls[1].steps.some(([method, value]) => method === 'or' && value === 'middle_name.is.null,middle_name.eq.'));
  await service.save(person, null, { allowSameName: true });
  assert.equal(writes(calls).length, 1);
});

test('partial name edits use saved name fields and exclude the record being edited', async () => {
  const { service, calls } = setup([{ data: { first_name: 'Example', middle_name: 'M', last_name: 'Before' } }, { data: [] }, { data: { id: 9 } }]);
  await service.save({ last_name: 'After' }, 9);
  assert.ok(calls[1].steps.some(step => JSON.stringify(step) === JSON.stringify(['neq', 'id', 9])));
  assert.ok(calls[1].steps.some(step => JSON.stringify(step) === JSON.stringify(['ilike', 'first_name', 'Example'])));
  assert.ok(calls[1].steps.some(step => JSON.stringify(step) === JSON.stringify(['ilike', 'middle_name', 'M'])));
  assert.deepEqual(writes(calls), [['update', { last_name: 'After' }]]);
});

test('unrelated edits do not trigger name warnings and failed checks never write', async () => {
  const first = setup();
  await first.service.save({ status: 'INACTIVE' }, 9);
  assert.equal(first.calls.length, 1);
  const second = setup([{ error: new Error('Connection failed') }]);
  await assert.rejects(second.service.save(person), /Connection failed/);
  assert.equal(writes(second.calls).length, 0);
});

test('validity filters preserve search/pagination and use inclusive expiry boundaries', async () => {
  const today = verificationDate();
  const end = new Date(today + 'T00:00:00Z'); end.setUTCDate(end.getUTCDate() + 30);
  for (const validity of ['valid', 'expired', 'expiring']) {
    const { service, calls } = setup();
    await service.list({ validity, search: 'Example', page: 1, pageSize: 20 });
    const steps = calls[0].steps, serialized = JSON.stringify(steps);
    assert.match(serialized, /first_name.ilike/);
    assert.deepEqual(steps.at(-1), ['range', 20, 39]);
    if (validity === 'valid') assert.ok(serialized.includes(`expiration_date.is.null,expiration_date.gte.${today}`));
    if (validity === 'expired') assert.ok(serialized.includes(`status.eq.EXPIRED,and(status.eq.ACTIVE,expiration_date.lt.${today})`));
    if (validity === 'expiring') {
      assert.ok(steps.some(step => JSON.stringify(step) === JSON.stringify(['gte', 'expiration_date', today])));
      assert.ok(steps.some(step => JSON.stringify(step) === JSON.stringify(['lte', 'expiration_date', end.toISOString().slice(0, 10)])));
    }
  }
  const invalid = setup();
  await assert.rejects(invalid.service.list({ validity: 'invalid' }), /Invalid validity/);
  assert.equal(invalid.calls.length, 0);
});
