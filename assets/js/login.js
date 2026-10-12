/**
 * Purpose: connect the login form to the existing-account authentication service.
 * Depends on: login.html field IDs and core/auth.js through the service container.
 * Debug: form errors appear in #status; incorrect redirects require checking the live role.
 */
import { getServices } from './core/services.js?v=96b812c63105';
import { accessSurface, applyAccessCover } from './design/access-renderer.js?v=96b812c63105';
import { watchDesign } from './design/runtime.js?v=96b812c63105';
import { designFailed } from './design/boot.js?v=96b812c63105';
import { brand } from './design/public-renderer.js?v=96b812c63105';
import { staffDestination } from './core/navigation.js?v=96b812c63105';

// Waiting for DOMContentLoaded also waits for the deferred SDK script.
function start() {
  document.querySelector('#access-root').replaceChildren(accessSurface('login'));
  const form = document.querySelector('#login-form');
  const status = document.querySelector('#status');
  const button = form.querySelector('button');
  let auth, services;
  try {
    services = getServices(); auth = services.auth;
    watchDesign(services.design).then(stop => window.addEventListener('pagehide', stop, { once: true }));
    // Update only identity and the decorative Cover 1 layer; never re-render a
    // form after the user starts typing or copy the existing cover record.
    Promise.allSettled([services.settings.read(), services.covers.read()]).then(([settingsResult, coversResult]) => {
      if (settingsResult.status === 'fulfilled') document.querySelector('.access-aside .brand')?.replaceWith(brand(settingsResult.value));
      if (coversResult.status === 'fulfilled') applyAccessCover(document.querySelector('#access-root'), coversResult.value.slides?.[0]);
    });
  }
  catch (error) { designFailed(); status.textContent = error.message; button.disabled = true; return; }
  const requested = new URLSearchParams(location.search).get('next');
  const destination = role => staffDestination(role, requested);
  let submitting = false;
  // Reuse a valid V3 session, but do not race a newly submitted login form.
  auth.currentStaff().then(staff => {
    if (staff && !submitting) location.replace(destination(staff.profile.role));
  }).catch(() => { status.textContent = 'Sign in with your existing account.'; });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submitting) return;
    // Prevent double submissions and clear password fields after either outcome.
    submitting = true;
    button.disabled = true;
    status.textContent = 'Signing in…';
    try {
      const staff = await auth.signIn(form.elements.email.value, form.elements.password.value);
      // Audit failure must not trap a valid account on the login screen.
      await services.activity.recordStaff('auth.login', 'authentication', 'Signed in to the staff workspace.').catch(() => {});
      form.elements.password.value = '';
      location.replace(destination(staff.profile.role));
    } catch (error) {
      status.textContent = error.message || 'Unable to sign in. Please try again.';
      form.elements.password.value = '';
      button.disabled = false;
      submitting = false;
    }
  });
}
if (document.readyState === 'loading' || document.readyState === 'interactive') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
