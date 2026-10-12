/**
 * Purpose: prove that every deployable HTML/CSS/JS/vendor/image file on GitHub
 * Pages has the same bytes as the selected local Git commit.
 * Dependencies: Node.js 18+, Git, network access, and the public Pages URL.
 * Debug: a mismatch names the exact path; confirm the Pages deployment
 * finished and CDN caches expired before considering another deployment.
 * Safety: performs public GET requests and local Git reads only; it never writes
 * records, signs in, uploads files, pushes commits, or changes deployment state.
 */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const PAGES_ROOT = 'https://brgysibulan.github.io/BARANGAYLITEV3/';
const EXPECTED_COMMIT = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const trackedPaths = execFileSync('git', ['ls-tree', '-r', '--name-only', 'HEAD'], { encoding: 'utf8' })
  .split(/\r?\n/u)
  .filter(Boolean);

// GitHub Pages only publishes the browser application; development and private
// recovery material must never become part of this comparison or deployment.
const deployablePaths = trackedPaths.filter((filePath) =>
  filePath.endsWith('.html') || filePath.startsWith('assets/'),
);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function compareFile(filePath) {
  // Binary social/share images can exceed Node's 1 MB child-process default;
  // this bounded buffer reads the committed asset without writing a temp file.
  const expected = execFileSync('git', ['show', `HEAD:${filePath}`], {
    encoding: 'buffer',
    maxBuffer: 25 * 1024 * 1024,
  });
  const url = new URL(filePath.split('/').map(encodeURIComponent).join('/'), PAGES_ROOT);

  // A unique harmless query prevents an old browser/CDN response from being
  // mistaken for the currently deployed file during a release verification.
  url.searchParams.set('deployment-check', EXPECTED_COMMIT.slice(0, 12));
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
  assert.equal(response.ok, true, `${filePath} returned HTTP ${response.status}`);
  const actual = Buffer.from(await response.arrayBuffer());
  assert.equal(sha256(actual), sha256(expected), `${filePath} does not match ${EXPECTED_COMMIT}`);
}

// Keep concurrency modest so verification does not create unnecessary traffic
// against the public barangay website.
const queue = [...deployablePaths];
const workers = Array.from({ length: Math.min(6, queue.length) }, async () => {
  while (queue.length) await compareFile(queue.shift());
});
await Promise.all(workers);

console.log(`PASS: ${deployablePaths.length} deployed files match Git commit ${EXPECTED_COMMIT}.`);
console.log('Deployment verification was read-only; no live records or files were changed.');

