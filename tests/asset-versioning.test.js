/**
 * Purpose: prove release tokens refresh local browser assets without changing external URLs.
 * Depends on: pure helpers from scripts/version-assets.mjs; no files or network are modified.
 * Debug: compare the expected query token with rewritten HTML and module import fixtures.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { stripAssetVersions, versionHtmlReferences, versionJavaScriptImports } from '../scripts/version-assets.mjs';

test('release token versions HTML entry assets but preserves pinned external scripts', () => {
  const html = '<link rel="stylesheet" href="../assets/css/design-system.css?v=000000000000"><script type="module" src="../assets/js/admin/app.js"></script><script src="https://cdn.example/sdk.js"></script>';
  const updated = versionHtmlReferences(html, '123456789abc');
  assert.match(updated, /design-system\.css\?v=123456789abc/);
  assert.match(updated, /admin\/app\.js\?v=123456789abc/);
  assert.match(updated, /https:\/\/cdn\.example\/sdk\.js/);
});

test('release token covers static and dynamic module imports and normalizes for hashing', () => {
  // Split the fixture keywords so the repository import checker does not treat
  // these intentionally nonexistent sample paths as real test dependencies.
  const source = 'im' + 'port { one } fr' + 'om "./one.js?v=000000000000"; const two = await im' + 'port("../two.js");';
  const updated = versionJavaScriptImports(source, 'abcdef123456');
  assert.match(updated, /\.\/one\.js\?v=abcdef123456/);
  assert.match(updated, /\.\.\/two\.js\?v=abcdef123456/);
  assert.equal(stripAssetVersions(updated), stripAssetVersions(source));
});
