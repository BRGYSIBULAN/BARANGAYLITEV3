/**
 * Purpose: permission-protected service health and measured usage, with explicit unknown billing values.
 * Depends on: existing Storage listing/RLS and public GitHub REST metadata; no new backend.
 * Debug: partial failures are separate from provider outages; refresh is user-driven and cached.
 */
import { unwrap } from '../core/client.js?v=96b812c63105';
import { BUCKETS } from './storage.js?v=96b812c63105';
export const GITHUB_REPO = 'Brgysibulan/BARANGAYLITEV3';
export function formatBytes(value) {
  if (value == null || !Number.isFinite(Number(value)) || Number(value) < 0) return 'Not available';
  const bytes = Number(value); if (bytes < 1024) return `${bytes} B`;
  const unit = bytes >= 1024 ** 3 ? 3 : bytes >= 1024 ** 2 ? 2 : 1;
  return `${(bytes / 1024 ** unit).toFixed(2)} ${['B', 'KB', 'MB', 'GB'][unit]}`;
}
export function createUsage(client, auth, fetcher = globalThis.fetch) {
  let cache;
  /** Traverse metadata only, with a fixed request budget; do not download residents' files. */
  async function storageUsage() {
    unwrap(await client.from('site_settings').select('id').eq('id', 1).single());
    const buckets = [];
    for (const bucket of Object.keys(BUCKETS)) {
      const pending = ['']; let files = 0, bytes = 0, unknown = 0, pages = 0, partial = false;
      try {
        while (pending.length) {
          const prefix = pending.shift();
          for (let offset = 0; ; offset += 100) {
            if (++pages > 200) { partial = true; pending.length = 0; break; }
            const rows = unwrap(await client.storage.from(bucket).list(prefix, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } })) || [];
            for (const row of rows) {
              if (!row.id && !row.metadata) pending.push(prefix ? `${prefix}/${row.name}` : row.name);
              else { files++; const size = row.metadata?.size; if (size != null && Number.isFinite(Number(size)) && Number(size) >= 0) bytes += Number(size); else unknown++; }
            }
            if (rows.length < 100) break;
          }
        }
        buckets.push({ bucket_id: bucket, files, bytes, unknown_files: unknown, partial });
      } catch (error) { buckets.push({ bucket_id: bucket, bytes: null, files: null, error: error.message }); }
    }
    return { database_bytes: null, buckets };
  }
  async function github() {
    const get = async suffix => { const response = await fetcher(`https://api.github.com/repos/${GITHUB_REPO}${suffix}`, { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(15000), credentials: 'omit', referrerPolicy: 'no-referrer' }); if (!response.ok) throw new Error(`GitHub could not be checked (HTTP ${response.status}).`); return response.json(); };
    const repo = await get('');
    let deployment = null, deploymentError = null;
    try {
      const deployments = await get('/deployments?environment=github-pages&per_page=1');
      if (deployments[0]) { const states = await get(`/deployments/${Number(deployments[0].id)}/statuses?per_page=1`); deployment = { state: states[0]?.state || 'pending', at: states[0]?.created_at || deployments[0].created_at }; }
    } catch (error) { deploymentError = error.message; }
    return { bytes: typeof repo.size === 'number' ? repo.size * 1024 : null, pushedAt: repo.pushed_at, deployment, deploymentError };
  }
  /** Recheck the real profile even on cache hits. Nothing is saved to public settings/storage. */
  async function read({ force = false } = {}) {
    await auth.requirePermission('system_usage');
    if (cache && (!force || Date.now() - cache.time < 60000)) return cache.value;
    const [supabase, git] = await Promise.allSettled([
      storageUsage(), github(),
    ]);
    const value = { checkedAt: new Date().toISOString(), supabase: supabase.status === 'fulfilled' ? supabase.value : null, supabaseError: supabase.status === 'rejected' ? supabase.reason.message : null,
      github: git.status === 'fulfilled' ? git.value : null, githubError: git.status === 'rejected' ? git.reason.message : null,
      billing: null, quota: null, bandwidth: null };
    cache = { time: Date.now(), value }; return value;
  }
  return Object.freeze({ read });
}
