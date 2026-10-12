/**
 * Purpose: keep open public pages in sync with the existing maintenance flag.
 * Depends on: settings.read(), native visibility/focus events, and the shared notice renderer.
 * Debug: refresh deduplicates reads; state changes must dispose the previous page/scanner.
 * Scope: this is website availability, not a replacement for database RLS or file permissions.
 */
import { element as el } from '../core/dom.js?v=96b812c63105';
import { brand } from '../design/public-renderer.js?v=96b812c63105';
import { MAINTENANCE_DEFAULTS } from '../data/maintenance.js?v=96b812c63105';

/** Recheck one small settings row, not every content table; hidden tabs do not poll. */
export function watchAvailability(service, onChange, { intervalMs = 60000 } = {}) {
  let disposed = false, pending, previous = '';
  async function refresh() {
    if (disposed) return null;
    if (pending) return pending;
    pending = (async () => {
      let settings, error;
      try {
        settings = await service.read();
        if (!settings || typeof settings.maintenance_mode !== 'boolean') throw new Error('Website availability could not be confirmed.');
      } catch (failure) { error = failure; settings = null; }
      if (disposed) return null;
      const signature = settings ? JSON.stringify(settings) : 'unavailable';
      // Failed checks close public UI until a successful retry; never assume maintenance is off.
      if (signature !== previous) { previous = signature; onChange(settings, error); }
      return settings;
    })();
    try { return await pending; } finally { pending = undefined; }
  }
  const visibleRefresh = () => { if (!document.hidden) void refresh(); };
  const timer = setInterval(visibleRefresh, intervalMs);
  window.addEventListener('focus', visibleRefresh);
  document.addEventListener('visibilitychange', visibleRefresh);
  const stop = () => { disposed = true; clearInterval(timer); window.removeEventListener('focus', visibleRefresh); document.removeEventListener('visibilitychange', visibleRefresh); };
  stop.refresh = refresh;
  // The caller starts the first read after assigning this controller to its local variable.
  return stop;
}

/** Maintenance has no public navigation; staff can always return to the existing login. */
export function maintenanceSurface(settings = {}, { error = null, mainId = 'public-main', retry, preview = false } = {}) {
  const main = el('main', '', { id: mainId, tabindex: '-1', class: 'maintenance-surface' });
  const card = el('section', '', { class: 'maintenance-card' });
  const identity = brand(settings); identity.removeAttribute('href'); card.append(identity);
  card.append(el('p', error ? 'CONNECTION CHECK' : 'PUBLIC WEBSITE MAINTENANCE', { class: 'eyebrow muted' }),
    el('h1', error ? 'Website temporarily unavailable' : settings.maintenance_title?.trim() || MAINTENANCE_DEFAULTS.maintenance_title),
    el('p', error ? 'We could not confirm the website status. Please check your connection and try again.' : settings.maintenance_message?.trim() || MAINTENANCE_DEFAULTS.maintenance_message, { class: 'maintenance-message' }),
    el('p', preview ? 'Preview only. This does not change the live website.' : 'Staff login remains available.', { class: 'muted compact' }));
  if (!preview) {
    const actions = el('div', '', { class: 'cluster' });
    const check = el('button', 'Check again', { type: 'button', class: 'primary' });
    check.addEventListener('click', async () => { check.disabled = true; try { await retry?.(); } finally { check.disabled = false; } });
    actions.append(check, el('a', 'Staff login', { href: 'login.html?next=settings', class: 'button' })); card.append(actions);
  }
  main.append(card); return main;
}
