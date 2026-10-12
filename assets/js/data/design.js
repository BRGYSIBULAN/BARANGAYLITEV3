/**
 * Purpose: read/publish only the V3 namespace inside the existing design_theme JSON column.
 * Depends on: site_settings(id=1), existing admin RLS, and pure design/model.js validators.
 * Debug: DESIGN_CONFLICT means another writer changed the JSON; reload before publishing.
 */
import { unwrap } from '../core/client.js?v=96b812c63105';
import { DESIGN_KEY, normalizeDesign, mergeDesign } from '../design/model.js?v=96b812c63105';
const SELECT = 'id,design_theme,updated_at';

/** Snapshot includes the exact JSON baseline for atomic compare-and-set, not a cached role. */
export function designSnapshot(row) {
  if (!row || row.id !== 1) throw new Error('Existing site settings row was not found.');
  return { id: row.id, raw: row.design_theme ?? null, updatedAt: row.updated_at, config: normalizeDesign(row.design_theme?.[DESIGN_KEY]) };
}

/** No insert/upsert: a missing row must never silently create a replacement settings record. */
export function createDesign(client, auth) {
  async function read() { return designSnapshot(unwrap(await client.from('site_settings').select(SELECT).eq('id', 1).single())); }
  async function publish(config, baseline) {
    await auth.requirePermission('design_studio');
    if (baseline?.id !== 1 || !Object.hasOwn(baseline, 'raw')) throw new Error('Reload the published design before saving.');
    // Unknown future formats must be reviewed, not silently downgraded by an older client.
    const stored = baseline.raw?.[DESIGN_KEY];
    if (stored?.version && stored.version !== 1) throw new Error('This design uses a newer version. Update the website before editing it.');
    const merged = mergeDesign(baseline.raw, config);
    // A protected RPC atomically limits delegated writers to the Design Studio namespace.
    const rows = unwrap(await client.rpc('staff_update_design_namespace', {
      p_permission: 'design_studio', p_namespace: DESIGN_KEY, p_expected: baseline.raw, p_next: merged,
    }));
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) { const error = new Error('The published design changed or access was revoked. Reload the latest design, review your draft, then publish again.'); error.code = 'DESIGN_CONFLICT'; throw error; }
    return designSnapshot(row);
  }
  return Object.freeze({ read, publish });
}
