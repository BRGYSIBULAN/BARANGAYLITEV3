/**
 * Purpose: accessible hero-cover slideshow and background refresh for saved public photos.
 * Depends on: the existing covers service, validated slides, native timers and shared CSS.
 * Debug: pause/hidden/reduced-motion prevent movement; focus/poll reads refresh dashboard changes.
 */
import { element as el } from '../core/dom.js?v=96b812c63105';
export const CAROUSEL_INTERVAL_MS = 5000;
export function createCarousel(slides, { autoplay = true, intervalMs = CAROUSEL_INTERVAL_MS } = {}) {
  const root = el('section', '', { class: 'cover-slideshow', 'aria-label': 'Barangay cover photos', 'aria-roledescription': 'carousel' });
  const image = el('img', '', { alt: slides[0]?.alt || '', width: 1600, height: 700, decoding: 'async', fetchpriority: 'high', draggable: 'false' });
  const caption = el('p', '', { class: 'cover-caption' });
  let index = 0, timer = null;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function show(target) { index = (target + slides.length) % slides.length; image.src = slides[index].url; image.alt = slides[index].alt; caption.textContent = slides[index].caption || ''; caption.hidden = !caption.textContent; }
  const tick = () => { if (!document.hidden && root.isConnected) show(index + 1); };
  const schedule = () => {
    if (timer) clearInterval(timer);
    timer = slides.length > 1 && autoplay && !reducedMotion ? setInterval(tick, intervalMs) : null;
  };
  const next = () => { show(index + 1); schedule(); };
  const previous = () => { show(index - 1); schedule(); };
  root.append(image, caption);
  show(0);
  schedule();
  return { element: root, next, previous, dispose: () => { if (timer) clearInterval(timer); } };
}

/** Keep an open homepage aligned with the existing dashboard record without a second cache/store. */
export function watchCovers(service, onChange, { intervalMs = 60000 } = {}) {
  let disposed = false, pending, previous;
  async function refresh() {
    // Deduplication prevents focus and the periodic timer from issuing the same read together.
    if (disposed) return [];
    if (pending) return pending;
    pending = (async () => {
      const snapshot = await service.read();
      if (disposed) return [];
      const slides = Array.isArray(snapshot?.slides) ? snapshot.slides : [];
      const signature = JSON.stringify(slides);
      if (signature !== previous) { previous = signature; onChange(slides); }
      return slides;
    })();
    try { return await pending; } finally { pending = undefined; }
  }
  // A failed background refresh retains the last known working hero until the next safe retry.
  const visibleRefresh = () => { if (!document.hidden) void refresh().catch(() => {}); };
  const timer = setInterval(visibleRefresh, intervalMs);
  window.addEventListener('focus', visibleRefresh);
  document.addEventListener('visibilitychange', visibleRefresh);
  const stop = () => { disposed = true; clearInterval(timer); window.removeEventListener('focus', visibleRefresh); document.removeEventListener('visibilitychange', visibleRefresh); };
  stop.refresh = refresh;
  return stop;
}
