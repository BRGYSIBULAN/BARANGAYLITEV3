/**
 * Purpose: reusable reads and explicit writes for the eight public-content tables.
 * Depends on: contracts.js, a Supabase client, and verified staff authorization.
 * Debug: inspect the chosen table/fields, publish flag, pagination, and RLS error.
 */
import { unwrap } from '../core/client.js?v=96b812c63105';
import { contentContract, pickFields, validatePayload } from './contracts.js?v=96b812c63105';

export function createContent(client, auth) {
  /** Staff sees authorized content; publicOnly always excludes unpublished records. */
  async function list(table, { publicOnly = false, page = 0, pageSize = 50, search = '', visibility = 'all', categories = [], excludeCategories = [], alphabetical = false } = {}) {
    const def = contentContract(table);
    if (!Number.isInteger(page) || page < 0 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new Error('Invalid pagination.');
    if (!publicOnly) await auth.requireStaff();
    let query = client.from(table).select(['id', ...def.fields].join(','), { count: 'exact' });
    // Keep the public predicate even when a staff session is present.
    if (publicOnly) query = query.eq(def.flag, true);
    if (!['all', 'published', 'draft'].includes(visibility)) throw new Error('Invalid visibility filter.');
    if (!publicOnly && visibility !== 'all') query = query.eq(def.flag, visibility === 'published');
    const validCategories = values => Array.isArray(values) && values.length <= 120 && values.every(value => typeof value === 'string' && value.trim() && value.length <= 80);
    if (!validCategories(categories) || !validCategories(excludeCategories)) throw new Error('Invalid directory categories.');
    if ((categories.length || excludeCategories.length || alphabetical) && table !== 'directory_entries') throw new Error('Directory filters are available only for directory records.');
    if (categories.length) query = query.in('category', categories);
    // Fixed reserved headings can be excluded one at a time; custom category text
    // remains data, never a PostgREST expression assembled by the browser.
    for (const category of excludeCategories) query = query.neq('category', category);
    if (search) {
      if ((publicOnly && table !== 'services') || typeof search !== 'string' || search.length > 100) throw new Error('Service searches must be at most 100 characters.');
      // Escaping LIKE wildcards keeps resident searches literal, not filter expressions.
      query = query.ilike(def.title, '%' + search.replace(/[\\%_]/g, '\\$&') + '%');
    }
    // Staff/functionary directories stay predictable across pages: group first, then name.
    if (alphabetical) query = query.order('category', { ascending: true }).order('name', { ascending: true });
    else query = query.order(def.order, { ascending: !def.descending, nullsFirst: false });
    const result = await query.order('id', { ascending: true }).range(page * pageSize, (page + 1) * pageSize - 1);
    return { rows: unwrap(result) || [], count: result.count ?? 0 };
  }

  /** A null ID creates a record; an existing ID updates only whitelisted fields. */
  async function save(table, values, id = null) {
    await auth.requireStaff();
    const def = contentContract(table);
    const payload = validatePayload(pickFields(values, def.fields));
    if (!Object.keys(payload).length) throw new Error('No supported fields to save.');
    if ((id === null || Object.hasOwn(payload, def.title)) && !String(payload[def.title] || '').trim()) throw new Error(`${def.label}: a name/title is required.`);
    if (id === null && ['pages', 'announcements'].includes(table) && !payload.slug?.trim()) throw new Error('A page slug is required.');
    if (id === null && def.fileField && !def.optionalFile && !payload[def.fileField]) throw new Error('An uploaded file or existing HTTPS file URL is required.');
    const query = id === null ? client.from(table).insert(payload) : client.from(table).update(payload).eq('id', id);
    // single() detects denied/zero-row writes instead of reporting false success.
    return unwrap(await query.select(['id', ...def.fields].join(',')).single());
  }

  /** Explicit record deletion only. Callers must confirm intent; linked files remain. */
  async function remove(table, id) {
    await auth.requireStaff();
    contentContract(table);
    if (id === null || id === undefined || id === '') throw new Error('Record ID required.');
    return unwrap(await client.from(table).delete().eq('id', id).select('id').single());
  }

  /** Fetch counts without downloading records; a failed count stays null, not zero. */
  async function counts({ publicOnly = false } = {}) {
    if (!publicOnly) await auth.requireStaff();
    const { CONTENT } = await import('./contracts.js?v=96b812c63105');
    return Promise.all(Object.entries(CONTENT).map(async ([table, def]) => {
      let query = client.from(table).select('id', { count: 'exact', head: true });
      if (publicOnly) query = query.eq(def.flag, true);
      const result = await query;
      if (result.error) return { table, label: def.label, count: null, error: result.error.message };
      return { table, label: def.label, count: result.count };
    }));
  }
  /** Read only small aggregates and recent titles; never download all content for a chart. */
  async function overview() {
    await auth.requireStaff();
    const { CONTENT } = await import('./contracts.js?v=96b812c63105');
    return Promise.all(Object.entries(CONTENT).map(async ([table, def]) => {
      const [total, published, recent] = await Promise.all([
        client.from(table).select('id', { count: 'exact', head: true }),
        client.from(table).select('id', { count: 'exact', head: true }).eq(def.flag, true),
        client.from(table).select(`id,${def.title},${table === 'gallery_items' ? 'created_at' : 'updated_at'}`).order(table === 'gallery_items' ? 'created_at' : 'updated_at', { ascending: false }).limit(3),
      ]);
      return { table, label: def.label, total: total.error ? null : total.count, published: published.error ? null : published.count,
        recent: recent.error ? [] : (recent.data || []).map(row => ({ title: row[def.title], at: row.updated_at || row.created_at, table })),
        error: total.error?.message || published.error?.message || recent.error?.message || null };
    }));
  }
  return Object.freeze({ list, save, remove, counts, overview });
}
