/**
 * Purpose: connect Content Admin application/activation screens to their existing logic.
 * Depends on: data/applications.js, verified editor role, and design/access-renderer.js.
 * Debug: no writes until explicit submission; activation requires an approved editor session.
 */
import { getServices } from './core/services.js?v=96b812c63105';
import { accessSurface } from './design/access-renderer.js?v=96b812c63105';
import { brand } from './design/public-renderer.js?v=96b812c63105';
import { watchDesign } from './design/runtime.js?v=96b812c63105';
import { designFailed } from './design/boot.js?v=96b812c63105';
async function start() {
  const mode = document.body.dataset.access;
  document.querySelector('#access-root').replaceChildren(accessSurface(mode));
  const form = document.querySelector('#access-form');
  const status = document.querySelector('#status');
  const button = form.querySelector('button');
  let services;
  let busy = false;
  button.disabled = true;
  try {
    services = getServices();
    watchDesign(services.design).then(stop => window.addEventListener('pagehide', stop, { once: true }));
    services.settings.read().then(settings => document.querySelector('.access-aside .brand')?.replaceWith(brand(settings))).catch(() => {});
    if (mode === 'activation') await services.auth.requireStaff(['editor']);
    button.disabled = false;
  } catch (error) { if (!services) designFailed(); status.textContent = mode === 'activation' ? 'An approved Content Admin invitation session is required. Open your valid invitation link or contact the System Admin.' : error.message; return; }
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return;
    busy = true; button.disabled = true; status.textContent = 'Submitting…';
    try {
      const values = Object.fromEntries(new FormData(form));
      if (mode === 'signup') {
        const result = await services.applications.apply(values);
        status.textContent = `Application submitted for System Admin review.${result.needsEmailConfirmation ? ' Check your email for confirmation.' : ''}`;
      } else {
        await services.applications.activate(values.password, values.confirmation);
        status.textContent = 'Password set. Your approved Content Admin account is ready.';
      }
      form.reset();
      // Success stays locked to prevent duplicate requests or repeated password changes.
    } catch (error) { status.textContent = error.message; busy = false; button.disabled = false; }
    finally { for (const input of form.querySelectorAll('input[type=password]')) input.value = ''; }
  });
}
if (document.readyState !== 'complete') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
