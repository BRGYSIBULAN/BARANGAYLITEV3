/**
 * Purpose: validate BRGYSI installation metadata, scoped paths, and correctly sized seal icons.
 * Depends on: checked-in manifest/HTML/PNG files and Node built-ins; no live access.
 * Debug: failures name an invalid app identity, missing shell link, or icon-size mismatch.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { staffDestination } from '../assets/js/core/navigation.js';

const root = new URL('../', import.meta.url);

test('BRGYSI installs inside the existing website scope with genuine PNG sizes', async () => {
  const manifestUrl = new URL('manifest.webmanifest', root);
  const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
  assert.equal(manifest.name, 'BRGYSI');
  assert.equal(manifest.short_name, 'BRGYSI');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.id, './');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.start_url, './login.html?next=admin-dashboard');
  assert.equal(manifest.icons.some(icon => icon.sizes === '192x192'), true);
  assert.equal(manifest.icons.some(icon => icon.sizes === '512x512'), true);
  for (const icon of manifest.icons) {
    const png = await readFile(new URL(icon.src, root));
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes);
  }
  // A relative manifest must remain under this site's path when deployed as GitHub Pages.
  const deployed = new URL('https://brgysibulan.github.io/BARANGAYLITEV3/manifest.webmanifest');
  assert.equal(new URL(manifest.scope, deployed).pathname, '/BARANGAYLITEV3/');
});

test('installed-app launch returns authenticated staff to the correct dashboard', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.webmanifest', root), 'utf8'));
  const start = new URL(manifest.start_url, 'https://brgysibulan.github.io/BARANGAYLITEV3/manifest.webmanifest');
  assert.equal(start.pathname, '/BARANGAYLITEV3/login.html');
  const next = start.searchParams.get('next');
  assert.equal(staffDestination('admin', next), 'admin/index.html#dashboard');
  assert.throws(() => staffDestination('editor', next), /System Admin access/);
  assert.throws(() => staffDestination(undefined, next), /System Admin access/);
  // Installation is not permission: non-dashboard URLs cannot be smuggled into the destination.
  assert.equal(staffDestination('admin', 'https://example.test/'), 'admin/index.html');
});

test('public and protected entry points resolve the same manifest and seal', async () => {
  for (const path of ['index.html', 'login.html', 'signup.html', 'activate.html', 'verify.html', 'design-studio.html', 'admin/index.html', 'editor/index.html']) {
    const url = new URL(path, root);
    const source = await readFile(url, 'utf8');
    const manifest = source.match(/rel="manifest" href="([^"]+)"/);
    assert.ok(manifest, path);
    assert.equal(new URL(manifest[1], url).href, new URL('manifest.webmanifest', root).href);
    assert.match(source, /name="application-name" content="BRGYSI"/);
    const icon = source.match(/rel="apple-touch-icon" href="([^"]+)"/);
    assert.ok(icon, path);
    const png = await readFile(new URL(icon[1], url));
    assert.equal(png.readUInt32BE(16), 180);
    assert.equal(png.readUInt32BE(20), 180);
  }
});
