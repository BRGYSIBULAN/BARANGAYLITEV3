/**
 * Purpose: preserve Content Admin eligibility, application, and activation logic.
 * Depends on: can_apply_content_admin RPC, Supabase Auth, and the applications table.
 * Debug: identify which stage failed: name check, signup, request insert, or activation.
 * These operations are never a System Admin account creation/reset path.
 */
import { unwrap } from '../core/client.js?v=96b812c63105';

// Existing Content Admin signup/activation logic; never used for System Admin.
export function createApplications(client, auth) {
  /** Validate identity first, then create a login and submit its separate access request. */
  async function apply({ displayName, email, password, confirmation, position = '', reason = '' }) {
    if ((await client.auth.getSession()).data?.session) throw new Error('Sign out before starting a new Content Admin application.');
    const name = displayName.trim();
    const address = email.trim().toLowerCase();
    if (name.length < 2 || name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw new Error('Valid full name and email required.');
    if (password.length < 8 || password !== confirmation) throw new Error('Passwords must match and contain at least 8 characters.');
    const allowed = unwrap(await client.rpc('can_apply_content_admin', { candidate_name: name }));
    if (allowed !== true) throw new Error('Your name was not found in the barangay ID records.');
    const data = unwrap(await client.auth.signUp({ email: address, password, options: { data: { display_name: name } } }));
    try {
      if (Array.isArray(data?.user?.identities) && data.user.identities.length === 0) throw new Error('This email already has an account. Use the existing login.');
      const text = [position && `Role / Position: ${position}`, reason && `Purpose: ${reason}`].filter(Boolean).join('\n') || null;
      // Signup and request insertion are separate operations. A partial success needs
      // admin reconciliation, not a retry that creates another account.
      const result = await client.from('content_admin_applications').insert({ display_name: name, email: address, reason: text });
      if (result.error) throw new Error('The login was created, but the access request could not be submitted. Contact the System Admin; do not create another account.');
      return { needsEmailConfirmation: !data?.session };
    } finally {
      // A new applicant must not remain signed in as if approval has already happened.
      await auth.signOut();
    }
  }
  /** Only an already approved editor can complete this password-setting flow. */
  async function activate(password, confirmation) {
    await auth.requireStaff(['editor']);
    if (password.length < 8 || password !== confirmation) throw new Error('Passwords must match and contain at least 8 characters.');
    return unwrap(await client.auth.updateUser({ password }));
  }
  return Object.freeze({ apply, activate });
}
