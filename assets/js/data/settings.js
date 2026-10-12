/**
 * Purpose: reuse the settings singleton and five existing barangay profile sections.
 * Depends on: site_settings(id=1), pages(slug), field contracts, and staff guards.
 * Debug: distinguish a settings-row error from a pages-slug or role/RLS error.
 */
import { unwrap } from '../core/client.js?v=96b812c63105';
import { SETTINGS_FIELDS, SETTINGS_SELECT, PROFILE_SECTIONS, pickFields, validatePayload } from './contracts.js?v=96b812c63105';

export function createSettings(client, auth) {
  /** Read public identity/contact/maintenance information, excluding legacy design data. */
  async function read() {
    return unwrap(await client.from('site_settings').select(SETTINGS_SELECT).eq('id', 1).single());
  }
  /** Patch the existing singleton; never replace the entire settings record. */
  async function update(values) {
    await auth.requirePermission('page_settings');
    const payload = validatePayload(pickFields(values, SETTINGS_FIELDS));
    if (!Object.keys(payload).length) throw new Error('No supported settings to save.');
    for (const key of ['barangay_name', 'hero_title']) {
      if (Object.hasOwn(payload, key) && !String(payload[key] || '').trim()) throw new Error(`${key} is required.`);
    }
    // The RPC permits an active System Admin or a non-expired Page Settings grant,
    // and it never accepts design_theme, primary_color or other unrelated columns.
    const rows = unwrap(await client.rpc('staff_update_site_settings', { p_patch: payload }));
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) throw new Error('Settings change was not confirmed. Reload before retrying.');
    return row;
  }
  /** Reuse legacy profile slugs so the new UI finds the same existing content. */
  async function readProfile({ publicOnly = false } = {}) {
    if (!publicOnly) await auth.requireStaff();
    let query = client.from('pages').select('id,slug,title,summary,content,is_published,sort_order')
      .in('slug', PROFILE_SECTIONS.map(section => section.slug));
    if (publicOnly) query = query.eq('is_published', true);
    return unwrap(await query.order('sort_order')) || [];
  }
  /** Upsert by stable slug; do not regenerate IDs or blank unedited summaries. */
  async function saveProfile(sections) {
    await auth.requireStaff();
    const rows = sections.map(section => {
      const def = PROFILE_SECTIONS.find(item => item.slug === section.slug);
      if (!def) throw new Error('Unsupported barangay profile section.');
      // Keep existing summaries and IDs by excluding them, not setting them null.
      return validatePayload({ slug: def.slug, title: def.title, content: section.content,
        is_published: section.is_published, sort_order: def.order });
    });
    if (!rows.length || new Set(rows.map(row => row.slug)).size !== rows.length) throw new Error('Profile sections must be unique and non-empty.');
    return unwrap(await client.from('pages').upsert(rows, { onConflict: 'slug' }).select('id,slug,content,is_published'));
  }
  return Object.freeze({ read, update, readProfile, saveProfile });
}
