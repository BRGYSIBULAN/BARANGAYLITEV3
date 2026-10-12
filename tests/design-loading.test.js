/**
 * Purpose: prevent a default/previous theme from appearing before the saved design or draft.
 * Depends on: Node tests, Linkedom, real controllers, and fake services; no live writes.
 * Debug: deferred reads reproduce slow reloads; invalid iframe messages must not reveal it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
import { beginDesignLoad, designReady, designFailed } from '../assets/js/design/boot.js';
import { watchDesign } from '../assets/js/design/runtime.js';
import { presetDesign } from '../assets/js/design/model.js';
import { startPublicPage } from '../assets/js/public/app.js';
import { startVerificationPage } from '../assets/js/public/verify.js';

const loader = '<div class="design-loader"><p data-design-message></p><button data-design-retry>Reload page</button></div>';
const flush = () => new Promise(resolve => setImmediate(resolve));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

/** Each test owns a fresh page; all timers/watchers are explicitly stopped before teardown. */
function page(content = '') {
  const { window } = parseHTML('<!doctype html><html lang="en" data-design-state="loading"><body>' + loader + content + '</body></html>');
  globalThis.window = window; globalThis.document = window.document; globalThis.Node = window.Node;
  globalThis.location = { hash: '', search: '', pathname: '/index.html', origin: 'https://example.test' };
  window.scrollTo = () => {}; document.hidden = false;
  return document.documentElement;
}
const focus = () => window.dispatchEvent(new window.Event('focus'));

test('every live/iframe shell gates its first paint before loading application scripts', async () => {
  for (const file of ['index.html', 'admin/index.html', 'editor/index.html', 'login.html', 'signup.html', 'activate.html', 'verify.html', 'preview.html']) {
    const html = await readFile(new URL('../' + file, import.meta.url), 'utf8');
    const { document: doc } = parseHTML(html);
    assert.equal(doc.documentElement.dataset.designState, 'loading', file);
    assert.equal(doc.querySelectorAll('.design-loader').length, 1, file);
    assert.ok(doc.querySelector('.design-loader [data-design-message]'), file);
    assert.ok(doc.querySelector('.design-loader [data-design-retry]'), file);
    assert.ok(doc.querySelector('.design-loader noscript'), file);
    assert.ok(doc.head.querySelector('script[src*="/design/boot.js?v="]'), file);
    assert.ok(html.indexOf('/design/boot.js') < html.lastIndexOf('<script'), file);
  }
  const demo = await readFile(new URL('../design-studio.html', import.meta.url), 'utf8');
  assert.doesNotMatch(demo, /data-design-state=/, 'The outer draft editor is not a live themed surface.');
  const css = await readFile(new URL('../assets/css/design-system.css', import.meta.url), 'utf8');
  assert.match(css, /body > :not\(\.design-loader\) \{ visibility:hidden; \}/);
  assert.match(css, /\.design-loader \{ display:flex;[^}]*background:#fff; color:#30363a;/);
});

test('missing entry script times out to a neutral retry, never to a guessed theme', async () => {
  const root = page(); beginDesignLoad(root, { timeoutMs: 5 });
  assert.equal(root.dataset.designState, 'loading');
  await delay(20);
  assert.equal(root.dataset.designState, 'error');
  assert.match(root.querySelector('[data-design-message]').textContent, /could not load/);
  assert.equal(root.dataset.theme, undefined);
  designReady(root); assert.equal(root.dataset.designState, 'ready');
});

test('a successful load cancels its timeout and later failures keep the working design', async () => {
  const root = page(); beginDesignLoad(root, { timeoutMs: 5 }); designReady(root);
  await delay(20); designFailed('Offline', root);
  assert.equal(root.dataset.designState, 'ready');
  root.removeAttribute('data-design-state'); beginDesignLoad(root); designReady(root); designFailed('Offline', root);
  assert.equal(root.hasAttribute('data-design-state'), false);
});

test('delayed saved colors and section order are applied before the first reveal', async () => {
  const root = page(), pending = deferred(); let renders = 0;
  const config = { ...presetDesign('institutional'), primary: '#123456', secondary: '#456789', width: 'boxed' };
  beginDesignLoad(root);
  const started = watchDesign({ read: () => pending.promise }, next => {
    renders++; assert.equal(root.dataset.designState, 'loading');
    assert.equal(root.dataset.theme, next.preset);
    assert.equal(root.style.getPropertyValue('--primary'), next.primary);
    root.dataset.renderedLayout = next.preset;
  });
  assert.equal(renders, 0); assert.equal(root.dataset.designState, 'loading'); assert.equal(root.dataset.theme, undefined);
  pending.resolve({ config }); const stop = await started;
  try {
    assert.equal(renders, 1); assert.equal(root.dataset.designState, 'ready');
    assert.equal(root.dataset.renderedLayout, 'institutional'); assert.equal(root.dataset.width, 'boxed');
    assert.equal(root.style.getPropertyValue('--secondary'), '#456789');
  } finally { stop(); designReady(root); }
});

test('hidden tabs still read their initial theme, but skip background polling', async () => {
  const root = page(); let reads = 0; document.hidden = true;
  const stop = await watchDesign({ read: async () => { reads++; return { config: presetDesign() }; } });
  try {
    assert.equal(reads, 1); assert.equal(root.dataset.designState, 'ready');
    focus(); await flush(); assert.equal(reads, 1);
    document.hidden = false; focus(); await flush(); assert.equal(reads, 2);
  } finally { stop(); }
});

test('an initial failed read stays neutral and a later successful read recovers', async () => {
  const root = page(); let offline = true, failures = 0;
  const config = { ...presetDesign('executive-civic'), accent: '#aabbcc' };
  const stop = await watchDesign({ read: async () => { if (offline) throw new Error('Offline'); return { config }; } }, (value, error) => { if (error) failures++; });
  try {
    assert.equal(failures, 1); assert.equal(root.dataset.designState, 'error'); assert.equal(root.dataset.theme, undefined);
    offline = false; focus(); await flush();
    assert.equal(root.dataset.designState, 'ready'); assert.equal(root.dataset.theme, 'executive-civic');
    offline = true; focus(); await flush();
    assert.equal(failures, 1); assert.equal(root.dataset.designState, 'ready');
    assert.equal(root.style.getPropertyValue('--accent'), '#aabbcc');
  } finally { stop(); }
});

for (const [id, start] of [['public-root', startPublicPage], ['verify-root', startVerificationPage]]) {
  test(id + ' cannot reveal its fast content response while the saved theme is pending', async () => {
    const root = page('<p id="status"></p><div id="' + id + '"></div>'), pending = deferred();
    const services = {
      settings: { read: async () => ({ id: 1, barangay_name: 'Test barangay', hero_title: 'Test homepage', maintenance_mode: false }) },
      design: { read: () => pending.promise }, covers: { read: async () => ({ slides: [] }) },
      content: { list: async () => ({ rows: [], count: 0 }) }, verification: {},
    };
    const started = start({ services }); await flush();
    assert.ok(document.getElementById(id).children.length > 0);
    assert.equal(root.dataset.designState, 'loading');
    pending.resolve({ config: { ...presetDesign('national-authority'), primary: '#123456' } });
    const stop = await started;
    try {
      assert.equal(root.dataset.designState, 'ready'); assert.equal(root.dataset.theme, 'national-authority');
      assert.equal(root.style.getPropertyValue('--primary'), '#123456');
    } finally { stop(); designReady(root); }
  });
}

test('preview waits for the trusted current draft instead of rendering a default preset', async () => {
  const root = page('<div id="preview-root"></div>'), messages = [];
  location.search = '?channel=fixture-channel';
  globalThis.parent = { postMessage: (value, origin) => messages.push({ value, origin }) };
  await import('../assets/js/design/preview.js');
  const preview = document.getElementById('preview-root');
  assert.equal(preview.children.length, 0); assert.equal(root.dataset.designState, 'loading');
  assert.equal(messages[0].value.type, 'brgy-design-ready');
  const config = { ...presetDesign('institutional'), primary: '#123456' };
  const data = { type: 'brgy-design-preview', channel: 'fixture-channel', config, surface: 'admin' };
  const send = overrides => { const event = new window.Event('message'); Object.assign(event, { origin: location.origin, source: parent, data, ...overrides }); window.dispatchEvent(event); };
  for (const invalid of [{ origin: 'https://other.test' }, { source: {} }, { data: { ...data, channel: 'wrong' } }, { data: { ...data, type: 'other' } }]) send(invalid);
  assert.equal(preview.children.length, 0); assert.equal(root.dataset.designState, 'loading');
  send({});
  assert.ok(preview.children.length > 0); assert.equal(root.dataset.theme, 'institutional');
  assert.equal(root.style.getPropertyValue('--primary'), '#123456'); assert.equal(root.dataset.designState, 'ready');
});
