/**
 * Purpose: keep open public pages aligned with saved module and Directory-group visibility.
 * Depends on: data/visibility.js snapshots, focus/visibility events, and safe DOM helpers.
 * Debug: a failed refresh returns null so disabled public services are never guessed as enabled.
 */
import { element as el } from '../core/dom.js?v=96b812c63105';
import { brand } from '../design/public-renderer.js?v=96b812c63105';
import { normalizeVisibility } from '../data/visibility.js?v=96b812c63105';

/** Read only the settings JSON; hidden tabs skip background polling after the initial check. */
export function watchVisibility(service, onChange, { intervalMs = 60000 } = {}) {
  let disposed = false, pending, previous = '';
  async function refresh() {
    if (disposed) return null;
    if (pending) return pending;
    pending = (async () => {
      let config, error;
      try {
        const snapshot = await service.read();
        config = normalizeVisibility(snapshot?.config);
      } catch (failure) { error = failure; config = null; }
      if (disposed) return null;
      const signature = config ? JSON.stringify(config) : 'unavailable';
      if (signature !== previous) { previous = signature; onChange(config, error); }
      return config;
    })();
    try { return await pending; } finally { pending = undefined; }
  }
  const visibleRefresh = () => { if (!document.hidden) void refresh(); };
  const timer = setInterval(visibleRefresh, intervalMs);
  window.addEventListener('focus', visibleRefresh);
  document.addEventListener('visibilitychange', visibleRefresh);
  const stop = () => { disposed = true; clearInterval(timer); window.removeEventListener('focus', visibleRefresh); document.removeEventListener('visibilitychange', visibleRefresh); };
  stop.refresh = refresh;
  return stop;
}

/** A disabled Verify link never reports a valid printed ID as invalid. */
export function unavailableSurface(settings = {}, { verification = false, error = null, retry, mainId = 'public-main' } = {}) {
  const main = el('main', '', { id: mainId, tabindex: '-1', class: 'maintenance-surface module-unavailable' });
  const card = el('section', '', { class: 'maintenance-card' });
  const identity = brand(settings); identity.removeAttribute('href'); card.append(identity);
  card.append(
    el('p', error ? 'CONNECTION CHECK' : 'PUBLIC SERVICE NOTICE', { class: 'eyebrow muted' }),
    el('h1', error ? 'Service status unavailable' : verification ? 'ID verification is temporarily unavailable' : 'This section is currently unavailable'),
    el('p', error
      ? 'We could not confirm which public sections are enabled. Please check your connection and try again.'
      : verification
        ? 'The ID record has not been marked invalid. Please try again later or contact the Barangay Office.'
        : 'This public section is currently turned off. No stored records or files were deleted.', { class: 'maintenance-message' })
  );
  const actions = el('div', '', { class: 'cluster' });
  if (retry) {
    const check = el('button', 'Check again', { type: 'button', class: 'primary' });
    check.addEventListener('click', async () => { check.disabled = true; try { await retry(); } finally { check.disabled = false; } });
    actions.append(check);
  }
  actions.append(el('a', 'Return to Home', { href: 'index.html#home', class: 'button' }));
  card.append(actions); main.append(card); return main;
}
