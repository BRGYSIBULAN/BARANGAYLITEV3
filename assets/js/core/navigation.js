/**
 * Purpose: preserve a requested staff destination through existing-account login.
 * Depends on: the verified profile role and a fixed module allowlist, never an arbitrary URL.
 * Debug: unsupported destinations fall back to the appropriate workspace overview.
 */
export function staffDestination(role, requested = '') {
  const admin = role === 'admin';
  // The installed BRGYSI app always requests its role-appropriate dashboard after login.
  const allowed = admin ? ['dashboard', 'settings', 'visibility', 'design-studio', 'covers', 'pages'] : ['dashboard', 'pages'];
  const hash = allowed.includes(requested) ? '#' + requested : '';
  return (admin ? 'admin/index.html' : 'editor/index.html') + hash;
}
