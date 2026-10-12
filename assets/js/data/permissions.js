/**
 * Purpose: read and manage temporary per-user access to selected System Admin modules.
 * Depends on: staff_delegated_permissions RLS and the verified profiles role.
 * Debug: confirm the target user, permission key, expiry, then the table's RLS policy.
 */
import { unwrap } from '../core/client.js?v=96b812c63105';

export const DELEGATED_MODULES = Object.freeze([
  { key: 'verification', route: 'verification', label: 'ID records & QR', description: 'Create, edit, delete, and download barangay ID records.' },
  { key: 'covers', route: 'covers', label: 'Cover photos', description: 'Upload and publish the existing homepage cover slideshow.' },
  { key: 'design_studio', route: 'design-studio', label: 'Design Studio', description: 'Preview and publish the shared website appearance.' },
  { key: 'page_settings', route: 'settings', label: 'Page settings', description: 'Edit barangay identity, contact details, and maintenance mode.' },
  { key: 'public_visibility', route: 'visibility', label: 'Public visibility', description: 'Turn public pages, directory groups, and page elements on or off.' },
  { key: 'system_usage', route: 'usage', label: 'System status & usage', description: 'View measured storage and deployment status.' },
]);

const KEYS = new Set(DELEGATED_MODULES.map(item => item.key));

function permissionKey(value) {
  const key = String(value || '');
  if (!KEYS.has(key)) throw new Error('Unsupported delegated permission.');
  return key;
}

function userId(value) {
  const id = String(value || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new Error('A valid Content Admin is required.');
  return id;
}

function expiry(value) {
  if (value == null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date <= new Date()) throw new Error('Access expiry must be in the future.');
  return date.toISOString();
}

/** Treat expired grants as off in navigation; protected RPC/RLS checks remain authoritative. */
export function permissionEnabled(row, now = Date.now()) {
  return row?.is_enabled === true && (!row.expires_at || new Date(row.expires_at).getTime() > now);
}

export function createPermissions(client, auth) {
  /** An editor can read only their rows; an admin can read all rows under RLS. */
  async function mine(staff = null) {
    const current = staff || await auth.requireStaff();
    if (current.profile.role === 'admin') return Object.fromEntries(DELEGATED_MODULES.map(item => [item.key, true]));
    const rows = unwrap(await client.from('staff_delegated_permissions')
      .select('permission_key,is_enabled,expires_at,updated_at')
      .eq('target_user_id', current.user.id)) || [];
    return Object.fromEntries(DELEGATED_MODULES.map(item => [item.key, permissionEnabled(rows.find(row => row.permission_key === item.key))]));
  }

  /** System Admin account management reads grants in one request, then groups them in the UI. */
  async function list() {
    await auth.requireStaff(['admin']);
    return unwrap(await client.from('staff_delegated_permissions')
      .select('target_user_id,permission_key,is_enabled,expires_at,granted_by,updated_at')
      .order('target_user_id').order('permission_key')) || [];
  }

  /** Upsert keeps one auditable row per user/module; turning access off never erases its history. */
  async function save(targetUserId, key, enabled, expiresAt = null) {
    const admin = await auth.requireStaff(['admin']);
    if (typeof enabled !== 'boolean') throw new Error('Choose whether access is on or off.');
    const payload = {
      target_user_id: userId(targetUserId),
      permission_key: permissionKey(key),
      is_enabled: enabled,
      expires_at: enabled ? expiry(expiresAt) : null,
      granted_by: admin.user.id,
      updated_at: new Date().toISOString(),
    };
    return unwrap(await client.from('staff_delegated_permissions')
      .upsert(payload, { onConflict: 'target_user_id,permission_key' })
      .select('target_user_id,permission_key,is_enabled,expires_at,granted_by,updated_at').single());
  }

  return Object.freeze({ mine, list, save });
}
