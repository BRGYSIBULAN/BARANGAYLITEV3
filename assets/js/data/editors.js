/**
 * Purpose: call the existing Content Admin management backend without admin secrets.
 * Depends on: System Admin authorization and the deployed manage-editors Edge Function.
 * Debug: inspect action/payload and function errors; do not bypass it with Auth admin keys.
 */
import { unwrap } from '../core/client.js?v=96b812c63105';

export function createEditors(client, auth) {
  /** All account changes stay behind the same server-side authorization boundary. */
  async function call(body) {
    await auth.requireStaff(['admin']);
    const data = unwrap(await client.functions.invoke('manage-editors', { body }));
    if (data?.error) throw new Error(data.error);
    return data || {};
  }

  /** Invitation links used by approved applications must remain on this HTTPS site. */
  function redirect(value) {
    const url = new URL(value);
    if (url.protocol !== 'https:') throw new Error('Activation redirects must use HTTPS.');
    if (typeof location !== 'undefined' && url.origin !== location.origin) throw new Error('Use a same-site activation URL.');
    return url.href;
  }

  /** Reject invalid IDs before an application request reaches the backend. */
  function applicationId(value) {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid application ID.');
    return id;
  }

  return Object.freeze({
    list: () => call({ action: 'list' }),
    approve: (id, redirectTo) => call({ action: 'approve_application', application_id: applicationId(id), redirect_to: redirect(redirectTo) }),
    reject: (id, note = '') => call({ action: 'reject_application', application_id: applicationId(id), decision_note: note }),
    deleteApplication: id => call({ action: 'delete_application', application_id: applicationId(id) }),
    setActive: (userId, active) => {
      if (typeof active !== 'boolean' || !userId) throw new Error('A user and explicit active status are required.');
      return call({ action: 'set_active', user_id: userId, is_active: active });
    },
    remove: (userId, email, confirmation) => {
      // A typed email confirmation helps prevent deleting the wrong Content Admin.
      if (!userId || !email || email.trim().toLowerCase() !== confirmation?.trim().toLowerCase()) throw new Error('Email confirmation did not match.');
      return call({ action: 'delete_content_admin', user_id: userId, confirm_email: confirmation.trim() });
    },
  });
}
