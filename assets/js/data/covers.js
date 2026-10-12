/**
 * Purpose: persist up to five public cover slides without adding a table or replacing settings.
 * Depends on: site_settings.design_theme, existing admin RLS and branding-media uploads.
 * Debug: a conflict means reload first; failed saves retain uploads instead of breaking links.
 */
import { unwrap } from '../core/client.js?v=96b812c63105';
const KEY = 'brgyweblitev3_covers';
const SELECT = 'id,design_theme,updated_at';
/** Cover data is public content; never store billing, credentials or private records here. */
export function validateCovers(slides) {
  if (!Array.isArray(slides) || slides.length > 5) throw new Error('A maximum of five cover photos is allowed.');
  const ids = new Set();
  return slides.map(slide => {
    if (!slide || typeof slide.id !== 'string' || !slide.id || ids.has(slide.id)) throw new Error('Cover IDs must be unique.');
    ids.add(slide.id);
    let url; try { url = new URL(slide.url); } catch { throw new Error('A cover needs a valid HTTPS image.'); }
    if (url.protocol !== 'https:') throw new Error('Cover images must use HTTPS.');
    if (!String(slide.alt || '').trim() || String(slide.alt).length > 180) throw new Error('Add a short photo description (up to 180 characters).');
    return { id: slide.id, url: url.href, alt: String(slide.alt).trim(), caption: String(slide.caption || '').slice(0, 300) };
  });
}
export function coverSnapshot(row) {
  if (row?.id !== 1) throw new Error('Existing site settings are missing.');
  const stored = row.design_theme?.[KEY];
  if (stored && stored.version !== 1) throw new Error('This cover format needs a newer website version.');
  return { raw: row.design_theme ?? null, slides: validateCovers(stored?.slides || []) };
}
export function createCovers(client, auth) {
  async function read() { return coverSnapshot(unwrap(await client.from('site_settings').select(SELECT).eq('id', 1).single())); }
  /** Compare the entire prior JSON so publishing a theme and covers cannot overwrite each other. */
  async function save(slides, baseline) {
    await auth.requirePermission('covers');
    if (!baseline || !Object.hasOwn(baseline, 'raw')) throw new Error('Reload the cover photos before saving.');
    const next = { ...(baseline.raw || {}), [KEY]: { version: 1, slides: validateCovers(slides) } };
    const rows = unwrap(await client.rpc('staff_update_design_namespace', {
      p_permission: 'covers', p_namespace: KEY, p_expected: baseline.raw, p_next: next,
    }));
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) throw new Error('Settings changed in another tab or access was revoked. Reload before saving; your draft is still here.');
    return coverSnapshot(row);
  }
  return Object.freeze({ read, save });
}
