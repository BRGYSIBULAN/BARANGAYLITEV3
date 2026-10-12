/**
 * Purpose: store public module and Directory-group visibility in the existing settings JSON.
 * Depends on: site_settings(id=1), its design_theme JSON column, and the existing admin RLS.
 * Debug: a VISIBILITY_CONFLICT means another settings writer won the atomic comparison.
 * Scope: visibility hides presentation only; it never deletes records, files, IDs, or accounts.
 */
import { unwrap } from '../core/client.js?v=96b812c63105';

export const VISIBILITY_KEY = 'brgyweblitev3_visibility';
const SELECT = 'id,design_theme,updated_at';

/** Public controls are explicit so unknown JSON keys can never create routes or UI. */
export const VISIBILITY_MODULES = Object.freeze([
  { key: 'announcements', label: 'News & Updates', area: 'Public modules', description: 'Navigation link, Home preview, and announcements page.' },
  { key: 'services', label: 'Barangay Services', area: 'Public modules', description: 'Service list and service search.' },
  { key: 'appointment', label: 'Request Appointment', area: 'Public modules', description: 'Published appointment instructions.' },
  { key: 'forms', label: 'Downloadable Forms', area: 'Public modules', description: 'Forms section and downloadable document list.' },
  { key: 'pages', label: 'Barangay Profile', area: 'Public modules', description: 'Published profile and development information.' },
  { key: 'contact', label: 'Contact Us', area: 'Public modules', description: 'Public address, telephone, email, and Facebook details.' },
  { key: 'disclosures', label: 'Transparency & Reports', area: 'Public modules', description: 'Public-disclosure documents and reports.' },
  { key: 'gallery_items', label: 'Community Gallery', area: 'Public modules', description: 'Gallery section, albums, and published photos.' },
  { key: 'verify', label: 'Verify Barangay ID', area: 'Public services', description: 'Manual and QR verification. Stored ID records remain unchanged when hidden.' },
  { key: 'directory', label: 'Directory', area: 'Directory', description: 'Master switch for every public Directory page and link.' },
  { key: 'officials', label: 'Barangay Officials', area: 'Directory', parent: 'directory', description: 'Officials preview and full officials hierarchy.' },
  { key: 'staff', label: 'Barangay Staff', area: 'Directory', parent: 'directory', description: 'Published records classified as Barangay Staff.' },
  { key: 'functionaries', label: 'Barangay Functionaries', area: 'Directory', parent: 'directory', description: 'Functionary headings and their published members.' },
  { key: 'directory_entries', label: 'Contact Directory', area: 'Directory', parent: 'directory', description: 'Published records classified as Contact.' },
  { key: 'hero', label: 'Homepage hero', area: 'Page elements', description: 'Homepage heading, cover photo, and resident quick links.' },
  { key: 'map', label: 'Barangay map', area: 'Page elements', parent: 'contact', description: 'Map and visit/contact band above the footer.' },
  { key: 'admin_portal', label: 'Admin Portal link', area: 'Page elements', description: 'Public navigation links only; direct staff login remains available.' },
]);

const MODULE_KEYS = new Set(VISIBILITY_MODULES.map(item => item.key));
const PARENTS = Object.freeze(Object.fromEntries(VISIBILITY_MODULES.filter(item => item.parent).map(item => [item.key, item.parent])));

/** Missing legacy visibility means everything remains visible after this feature deploys. */
export function defaultVisibility() {
  return { version: 1, modules: Object.fromEntries([...MODULE_KEYS].map(key => [key, true])), groups: {} };
}

function validGroupName(value) {
  const name = String(value || '').trim();
  if (!name || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name)) throw new Error('Directory group names must be 1 to 80 readable characters.');
  return name;
}

/** Invalid values fall back safely; an unknown future version requires a newer client. */
export function normalizeVisibility(value) {
  const result = defaultVisibility();
  if (value == null) return result;
  if (typeof value !== 'object' || Array.isArray(value)) return result;
  if (value.version != null && value.version !== 1) throw new Error('This visibility format needs a newer website version.');
  if (value.modules && typeof value.modules === 'object' && !Array.isArray(value.modules)) {
    for (const key of MODULE_KEYS) if (typeof value.modules[key] === 'boolean') result.modules[key] = value.modules[key];
  }
  if (value.groups && typeof value.groups === 'object' && !Array.isArray(value.groups)) {
    const entries = Object.entries(value.groups).slice(0, 100);
    for (const [rawName, enabled] of entries) {
      if (typeof enabled !== 'boolean') continue;
      try { result.groups[validGroupName(rawName)] = enabled; } catch { /* Ignore malformed legacy keys instead of exposing them. */ }
    }
  }
  return result;
}

/** Parent switches hide children without overwriting the child's saved preference. */
export function moduleVisible(config, key) {
  if (!MODULE_KEYS.has(key)) return false;
  const normalized = normalizeVisibility(config);
  if (normalized.modules[key] === false) return false;
  const parent = PARENTS[key];
  return parent ? moduleVisible(normalized, parent) : true;
}

export function directoryGroupVisible(config, name) {
  const normalized = normalizeVisibility(config);
  const key = validGroupName(name);
  return moduleVisible(normalized, 'directory') && normalized.groups[key] !== false;
}

export function hiddenDirectoryGroups(config) {
  return Object.entries(normalizeVisibility(config).groups).filter(([, enabled]) => enabled === false).map(([name]) => name);
}

export function visibilitySnapshot(row) {
  if (!row || row.id !== 1) throw new Error('Existing site settings are missing.');
  return { id: row.id, raw: row.design_theme ?? null, updatedAt: row.updated_at, config: normalizeVisibility(row.design_theme?.[VISIBILITY_KEY]) };
}

export function createVisibility(client, auth) {
  async function read() {
    return visibilitySnapshot(unwrap(await client.from('site_settings').select(SELECT).eq('id', 1).single()));
  }

  /** Each call reads and patches one control, so there is no whole-page Save overwrite. */
  async function saveChange(change) {
    await auth.requirePermission('public_visibility');
    const baseline = await read();
    if (baseline.raw !== null && (typeof baseline.raw !== 'object' || Array.isArray(baseline.raw))) throw new Error('Unsupported legacy settings format. Update the website before changing visibility.');
    const nextConfig = normalizeVisibility(baseline.config);
    change(nextConfig);
    const next = { ...(baseline.raw || {}), [VISIBILITY_KEY]: nextConfig };
    // Compare and patch through the protected namespace RPC so a delegated editor
    // cannot change covers, Design Studio values, or any unrelated settings key.
    const rows = unwrap(await client.rpc('staff_update_design_namespace', {
      p_permission: 'public_visibility', p_namespace: VISIBILITY_KEY,
      p_expected: baseline.raw, p_next: next,
    }));
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) {
      const error = new Error('Page settings changed in another tab. Reload visibility before saving again.');
      error.code = 'VISIBILITY_CONFLICT';
      throw error;
    }
    return visibilitySnapshot(row);
  }

  async function saveModule(key, enabled) {
    if (!MODULE_KEYS.has(key) || typeof enabled !== 'boolean') throw new Error('Invalid visibility change.');
    return saveChange(config => { config.modules[key] = enabled; });
  }

  async function saveGroup(name, enabled) {
    const group = validGroupName(name);
    if (typeof enabled !== 'boolean') throw new Error('Invalid group visibility change.');
    return saveChange(config => { config.groups[group] = enabled; });
  }

  return Object.freeze({ read, saveModule, saveGroup });
}
