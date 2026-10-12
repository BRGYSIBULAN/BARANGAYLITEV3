/**
 * Purpose: classify existing verification people for the public Directory without copying names or designations.
 * Depends on: the three directory RPCs installed on the existing BRGYWEB-LITE Supabase project.
 * Debug: check the requested section/view first, then RPC privileges and the person's ACTIVE status.
 */
import { unwrap } from '../core/client.js?v=96b812c63105';
import { DIRECTORY_SECTIONS } from './contracts.js?v=96b812c63105';

const SECTION_KEYS = new Set(Object.keys(DIRECTORY_SECTIONS));
const STAFF_VIEWS = new Set(['section', 'unassigned', 'all', 'published', 'hidden']);

/** Add presentation aliases while retaining the exact database field names for editing. */
export function directoryPerson(row = {}) {
  const name = String(row.name || '').trim() || 'Name not recorded';
  const designation = String(row.designation || '').trim() || null;
  const subcategory = String(row.directory_subcategory || '').trim() || null;
  const photo = String(row.directory_photo_url || '').trim() || null;
  return {
    ...row,
    name,
    designation,
    directory_subcategory: subcategory,
    directory_photo_url: photo,
    full_name: name,
    position: designation,
    role_title: designation,
    category: subcategory,
    photo_url: photo,
    sort_order: Number(row.directory_sort_order) || 0,
    is_active: row.directory_is_published === true && row.directory_is_eligible !== false,
  };
}

function validatePage(page, pageSize) {
  if (!Number.isInteger(page) || page < 0 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new Error('Invalid Directory pagination.');
}

function validateSection(section, { nullable = false } = {}) {
  if (nullable && section === null) return;
  if (!SECTION_KEYS.has(section)) throw new Error('Choose a valid Directory category.');
}

export function createDirectory(client, auth) {
  /** Staff RPC returns public-safe identity fields only, never ID numbers, QR tokens, or dates. */
  async function listStaff({ section, view = 'section', search = '', page = 0, pageSize = 20 } = {}) {
    await auth.requireStaff(['admin', 'editor']);
    validateSection(section); validatePage(page, pageSize);
    if (!STAFF_VIEWS.has(view)) throw new Error('Choose a valid Directory list view.');
    if (typeof search !== 'string' || search.length > 100) throw new Error('Search must be at most 100 characters.');
    const rows = unwrap(await client.rpc('staff_list_directory_records', {
      p_section: section, p_view: view, p_search: search.trim(), p_offset: page * pageSize, p_limit: pageSize,
    })) || [];
    return { rows: rows.map(directoryPerson), count: Number(rows[0]?.total_count) || 0 };
  }

  /** Anonymous callers receive only records explicitly published for one Directory section. */
  async function listPublic({ section, page = 0, pageSize = 50, excludedSubcategories = [] } = {}) {
    validateSection(section); validatePage(page, pageSize);
    if (!Array.isArray(excludedSubcategories) || excludedSubcategories.length > 100 || excludedSubcategories.some(value => typeof value !== 'string' || !value.trim() || value.length > 80)) throw new Error('Invalid hidden Directory groups.');
    const rows = unwrap(await client.rpc('list_public_directory_records', {
      p_section: section, p_offset: page * pageSize, p_limit: pageSize,
      p_excluded_subcategories: excludedSubcategories.map(value => value.trim()),
    })) || [];
    return { rows: rows.map(directoryPerson), count: Number(rows[0]?.total_count) || 0 };
  }

  /** Save only Directory metadata on an existing person; identity and verification fields are never writable here. */
  async function save({ id, section, subcategory = null, photoUrl = null, sortOrder = 0, isPublished = false } = {}) {
    await auth.requireStaff(['admin', 'editor']);
    if (id === null || id === undefined || id === '') throw new Error('Choose an existing database person.');
    validateSection(section, { nullable: true });
    const cleanSubcategory = String(subcategory || '').trim() || null;
    const cleanPhoto = String(photoUrl || '').trim() || null;
    if (section && section !== 'officials' && !cleanSubcategory) throw new Error('Choose a Staff or Functionary subcategory.');
    if (cleanSubcategory && (cleanSubcategory.length > 80 || /[\u0000-\u001f\u007f]/.test(cleanSubcategory))) throw new Error('Subcategory must be 1 to 80 readable characters.');
    if (!Number.isInteger(sortOrder) || sortOrder < 0) throw new Error('Display order must be a non-negative integer.');
    if (typeof isPublished !== 'boolean') throw new Error('Published must be true or false.');
    if (cleanPhoto) {
      let parsed;
      try { parsed = new URL(cleanPhoto); } catch { throw new Error('Photo link must be a valid HTTPS URL.'); }
      if (parsed.protocol !== 'https:') throw new Error('Photo link must be a valid HTTPS URL.');
    }
    const rows = unwrap(await client.rpc('staff_save_directory_record', {
      p_id: id,
      p_section: section,
      p_subcategory: section === 'officials' || section === null ? null : cleanSubcategory,
      p_photo_url: cleanPhoto,
      p_sort_order: sortOrder,
      p_is_published: section === null ? false : isPublished,
    }));
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) throw new Error('Directory assignment was not saved. Refresh and try again.');
    return directoryPerson(row);
  }

  /** Actual saved headings drive visibility controls instead of a second hardcoded list. */
  async function headings() {
    await auth.requireStaff(['admin', 'editor']);
    const rows = unwrap(await client.rpc('staff_list_directory_headings')) || [];
    return rows
      .filter(row => ['staff', 'functionaries'].includes(row.directory_section) && String(row.directory_subcategory || '').trim())
      .map(row => ({ section: row.directory_section, name: row.directory_subcategory.trim() }));
  }

  /** Small counts keep the Dashboard aligned with the same personnel source. */
  async function overview() {
    const rows = await Promise.all(Object.keys(DIRECTORY_SECTIONS).map(async section => {
      const [assigned, published] = await Promise.all([
        listStaff({ section, view: 'section', pageSize: 1 }),
        listStaff({ section, view: 'published', pageSize: 1 }),
      ]);
      return { section, label: DIRECTORY_SECTIONS[section], total: assigned.count, published: published.count };
    }));
    return rows;
  }

  return Object.freeze({ listStaff, listPublic, save, headings, overview });
}
