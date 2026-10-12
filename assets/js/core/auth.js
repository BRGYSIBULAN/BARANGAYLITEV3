/**
 * Purpose: sign in existing accounts and verify their current staff permissions.
 * Depends on: Supabase Auth and public.profiles; never on a cached UI role.
 * Debug: check Auth first, then the matching profiles.user_id/role/is_active row.
 */
import { unwrap } from './client.js?v=96b812c63105';

// Profile rows, not editable user_metadata or local role caches, determine access.
// These checks improve UX; the existing server-side RLS remains authoritative.
export function createAuth(client) {
  /** Return verified active staff, null for no access, or throw a connection error. */
  async function currentStaff() {
    const result = await client.auth.getUser();
    if (result.error) {
      if (result.error.name === 'AuthSessionMissingError') return null;
      throw result.error;
    }
    const user = result.data?.user;
    if (!user) return null;
    const profile = unwrap(await client.from('profiles')
      .select('user_id,role,display_name,is_active').eq('user_id', user.id).maybeSingle());
    if (!profile || profile.is_active !== true || !['admin', 'editor'].includes(profile.role)) return null;
    return { user, profile };
  }

  /** Common guard; admin-only callers must explicitly pass ['admin']. */
  async function requireStaff(roles = ['admin', 'editor']) {
    const staff = await currentStaff();
    if (!staff || !roles.includes(staff.profile.role)) {
      const error = new Error('An active staff account with the required access is needed.');
      error.code = 'STAFF_ACCESS_REQUIRED';
      throw error;
    }
    return staff;
  }

  /** Resolve delegated navigation access; protected tables/RPCs still enforce the same grant server-side. */
  async function requirePermission(permission) {
    const allowed = ['verification', 'covers', 'design_studio', 'page_settings', 'public_visibility', 'system_usage'];
    if (!allowed.includes(permission)) throw new Error('Unsupported staff permission.');
    const staff = await requireStaff();
    if (staff.profile.role === 'admin') return staff;
    const grant = unwrap(await client.from('staff_delegated_permissions')
      .select('permission_key,is_enabled,expires_at')
      .eq('target_user_id', staff.user.id).eq('permission_key', permission).maybeSingle());
    if (!grant || grant.is_enabled !== true || (grant.expires_at && new Date(grant.expires_at) <= new Date())) {
      const error = new Error('This temporary module access is off or expired. Ask the System Admin to enable it.');
      error.code = 'MODULE_ACCESS_REQUIRED';
      throw error;
    }
    return staff;
  }

  /** Authenticate the existing user; this never creates accounts or resets passwords. */
  async function signIn(email, password) {
    // Do not trim or otherwise change a user's existing password.
    unwrap(await client.auth.signInWithPassword({ email: email.trim(), password }));
    const staff = await currentStaff();
    if (!staff) {
      unwrap(await client.auth.signOut({ scope: 'local' }));
      throw new Error('This account does not have active staff access. Contact the System Admin.');
    }
    return staff;
  }

  /** End only the V3 session, leaving other devices' sessions valid. */
  async function signOut() {
    // Signing out of V3 must not revoke sessions on the old website/devices.
    unwrap(await client.auth.signOut({ scope: 'local' }));
  }

  return Object.freeze({ currentStaff, requireStaff, requirePermission, signIn, signOut });
}
