/**
 * Purpose: shared Login, Content Admin application, and activation layout for live/preview use.
 * Depends on: public-renderer brand, DOM helpers, and the central CSS; no auth operations.
 * Debug: preview forms are disabled; live entry modules attach the existing service handlers.
 */
import { element as el } from '../core/dom.js?v=96b812c63105';
import { brand } from './public-renderer.js?v=96b812c63105';
export const ACCESS = Object.freeze({
  login: { title: 'Welcome.', subtitle: 'Sign in with your existing barangay staff account.', button: 'Sign in', fields: [['email', 'Email address', 'email'], ['password', 'Password', 'password']] },
  signup: { title: 'Serve your community.', subtitle: 'Apply for Content Admin access. System Admin approval is required.', button: 'Submit application', fields: [['displayName', 'Full name (as registered)', 'text'], ['email', 'Email address', 'email'], ['position', 'Role / position (optional)', 'text'], ['reason', 'Reason for applying (optional)', 'text'], ['password', 'Password (at least 8 characters)', 'password'], ['confirmation', 'Confirm password', 'password']] },
  activation: { title: 'Activate your access.', subtitle: 'For approved Content Admin accounts with a valid invitation session only.', button: 'Set password & activate', fields: [['password', 'New password (at least 8 characters)', 'password'], ['confirmation', 'Confirm new password', 'password']] },
});

/** Reuse Dashboard Cover 1 as a decorative login banner; no second image record is created. */
export function applyAccessCover(root, cover) {
  const aside = root?.querySelector?.('.access-aside');
  if (!aside) return false;
  aside.querySelector('.access-cover-media')?.remove();
  let url;
  try { url = new URL(cover?.url); } catch { aside.classList.remove('has-cover'); return false; }
  if (url.protocol !== 'https:') { aside.classList.remove('has-cover'); return false; }
  const media = el('div', '', { class: 'access-cover-media', 'aria-hidden': 'true' });
  media.append(el('img', '', { src: url.href, alt: '' }));
  aside.prepend(media); aside.classList.add('has-cover');
  return true;
}

/** Preview uses actual fields but never accepts credentials or submits a form. */
export function accessSurface(mode, settings = {}, { preview = false } = {}) {
  const def = ACCESS[mode] || ACCESS.login;
  const root = el('div', '', { class: 'access-shell' });
  const aside = el('aside', '', { class: 'access-aside' });
  aside.append(brand(settings), el('p', 'BARANGAY DIGITAL WORKSPACE', { class: 'eyebrow' }), el('h2', 'Public service. One connected workspace.'), el('p', 'The same barangay. The same trusted account. A clearer way to work.'));
  const main = el('main', '', { class: 'access-main' });
  const card = el('div', '', { class: 'access-card' });
  card.append(el('a', '← Public website', { href: 'index.html' }), el('h1', def.title), el('p', def.subtitle, { class: 'muted' }));
  const form = el('form', '', { id: mode === 'login' ? 'login-form' : 'access-form' });
  for (const [name, label, type] of def.fields) {
    const field = el('div', '', { class: 'field' });
    const input = el('input', '', { id: name, name, type, required: ['position', 'reason'].includes(name) ? null : '', maxlength: type === 'password' ? 128 : 500, autocomplete: name === 'email' ? 'username' : type === 'password' ? mode === 'login' ? 'current-password' : 'new-password' : name === 'displayName' ? 'name' : 'off', minlength: type === 'password' && mode !== 'login' ? 8 : null });
    input.disabled = preview; field.append(el('label', label, { for: name }), input); form.append(field);
  }
  const submit = el('button', def.button, { type: 'submit', class: 'primary' }); submit.disabled = preview; form.append(submit);
  card.append(form, el('p', preview ? 'Preview only — form submissions are disabled.' : '', { id: 'status', role: 'status', 'aria-live': 'polite', class: 'studio-message' }));
  if (mode === 'login') card.append(el('p', 'Use your existing email and password. Your System Admin account stays the same.', { class: 'muted' }), el('a', 'Apply as Content Admin', { href: 'signup.html' }));
  else card.append(el('a', 'Already have an account? Sign in', { href: 'login.html' }));
  main.append(card); root.append(aside, main); return root;
}
