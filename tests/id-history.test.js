/**
 * Purpose: verify admin-only history reads and safe, disposable history dialogs.
 * Depends on: Node tests, linkedom, and fake requests; no production identities.
 * Debug: inspect auth calls, requested record/page, and dialog output on failures.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { createVerification } from '../assets/js/data/verification.js';
import { historyEntry, showIdHistory } from '../assets/js/staff/id-history.js';
import { mountContent } from '../assets/js/staff/content-screen.js';
const { window } = parseHTML('<html><body></body></html>');
globalThis.document = window.document; globalThis.window = window; globalThis.Node = window.Node;
window.HTMLElement.prototype.showModal = function () { this.setAttribute('open', ''); };
window.HTMLElement.prototype.close = function () { this.removeAttribute('open'); };
const tick = () => new Promise(resolve => setImmediate(resolve));

test('history requires admin before querying and validates pagination and record identity', async () => {
  const steps = [], query = {};
  for (const method of ['select','eq','order','range']) query[method] = (...args) => { steps.push([method,...args]); return query; };
  query.then = resolve => resolve({ data: [], count: 0 });
  const service = createVerification({ from: table => { steps.push(['from',table]); return query; } }, { requireStaff: async roles => steps.push(['roles',roles]) });
  await service.history(7, { page: 1, pageSize: 20 });
  assert.deepEqual(steps[0], ['roles',['admin']]);
  assert.ok(steps.some(step => step[0] === 'eq' && step[1] === 'record_id' && step[2] === 7));
  assert.deepEqual(steps.at(-1), ['range',20,39]);
  for (const [id, options] of [[null,{}],[7,{page:-1}],[7,{pageSize:100}]]) await assert.rejects(service.history(id, options), /Invalid history/);
  const denied = createVerification({ from() { assert.fail('Query before authorization'); } }, { requireStaff: async () => { throw new Error('Denied'); } });
  await assert.rejects(denied.history(7), /Denied/);
});

test('history renders field changes as text and excludes tokens and unknown fields', () => {
  const view = historyEntry({ operation:'UPDATE', actor_name:'<img src=x>', actor_role:'admin', occurred_at:'2026-10-03T00:00:00Z', old_values:{ first_name:'Before', qr_token:'secret' }, new_values:{ first_name:'<script>after</script>', arbitrary:'hidden', expiration_date:null } });
  assert.match(view.textContent, /Before/); assert.match(view.textContent, /<script>after<\/script>/);
  assert.match(view.textContent, /Not set/); assert.match(view.textContent, /Manila/);
  assert.equal(view.querySelector('img,script'), null);
  assert.doesNotMatch(view.textContent, /secret|hidden/);
});

test('history paginates, distinguishes errors from empty history, and retries', async () => {
  const calls = []; let fail = true;
  const close = showIdHistory({id:7,control_number:'TEST'}, { history: async (id,options) => {
    calls.push(options); if (fail) throw new Error('Offline');
    return { rows: [], count: options.page === 0 ? 21 : 0 };
  } }, () => true);
  try {
    await tick(); assert.match(document.querySelector('dialog').textContent, /Could not load history: Offline/);
    fail = false; [...document.querySelectorAll('button')].find(b=>b.textContent==='Refresh history').click(); await tick();
    [...document.querySelectorAll('button')].find(b=>b.textContent==='Older →').click(); await tick();
    assert.equal(calls.at(-1).page,1); assert.match(document.querySelector('dialog').textContent,/No detailed changes recorded yet/);
  } finally { close(); }
});

test('closing a history dialog discards delayed responses', async () => {
  let resolve;
  const close = showIdHistory({id:7,control_number:'TEST'}, { history: () => new Promise(done=>{resolve=done;}) }, () => true);
  close(); resolve({ rows:[{actor_name:'Late response'}], count:1 }); await tick();
  assert.equal(document.querySelector('dialog'),null);
});

test('only the System Admin shell exposes the record History button', async () => {
  for (const canViewHistory of [false,true]) {
    const root=document.createElement('main');document.body.append(root);
    const close=mountContent(root,'verification',{verification:{list:async()=>({rows:[{id:7,control_number:'TEST'}],count:1})}},()=>true,{canViewHistory});
    await tick();
    assert.equal([...root.querySelectorAll('button')].some(b=>b.textContent==='History'),canViewHistory);
    close();root.remove();
  }
});
