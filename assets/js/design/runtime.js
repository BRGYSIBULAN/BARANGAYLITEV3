/**
 * Purpose: apply the same approved design to Public, staff, access, and preview shells.
 * Depends on: model.js and one central assets/css/design-system.css stylesheet.
 * Debug: inspect the html data-theme attributes; only validated CSS variables are written.
 */
import { normalizeDesign, contrastText, FONTS } from './model.js?v=96b812c63105';
import { designReady, designFailed } from './boot.js?v=96b812c63105';

/** No stylesheet injection: every page uses the same tokens and layout selectors. */
export function applyDesign(value, root = document.documentElement) {
  const config = normalizeDesign(value);
  root.dataset.theme = config.preset;
  root.dataset.corners = config.corners;
  root.dataset.width = config.width;
  root.dataset.sidebar = config.sidebar;
  root.dataset.headerDensity = config.headerDensity;
  root.dataset.surface = config.surface;
  root.dataset.cardStyle = config.cardStyle;
  root.dataset.spacing = config.spacing;
  root.dataset.navStyle = config.navStyle;
  root.dataset.footerStyle = config.footerStyle;
  root.dataset.heroOverlay = config.heroOverlay;
  root.dataset.heroOverlayStyle = config.heroOverlayStyle;
  root.dataset.heroTone = config.heroTone;
  root.dataset.heroImage = config.heroImage;
  root.dataset.heroFocus = config.heroFocus;
  root.dataset.heroHeight = config.heroHeight;
  root.dataset.heroAlign = config.heroAlign;
  root.dataset.officialsLayout = config.officialsLayout;
  root.style.setProperty('--primary', config.primary);
  root.style.setProperty('--on-primary', contrastText(config.primary));
  // The same validated panel color/foreground pair is used in previews and live shells.
  root.style.setProperty('--secondary', config.secondary);
  root.style.setProperty('--on-secondary', contrastText(config.secondary));
  root.style.setProperty('--accent', config.accent);
  root.style.setProperty('--on-accent', contrastText(config.accent));
  root.style.setProperty('--heading-font', FONTS[config.font]);
  root.style.setProperty('--body-font', FONTS[config.bodyFont]);
  const heroColor = config.heroTone === 'secondary' ? config.secondary : config.heroTone === 'neutral' ? '#18211f' : config.primary;
  root.style.setProperty('--hero-color', heroColor);
  return config;
}

/** Refresh already-open tabs without Realtime/schema changes; retain last good design offline. */
export async function watchDesign(service, onChange = () => {}) {
  let disposed = false;
  let running = false;
  let previous = '';
  const refresh = async (initial = false) => {
    // A background-opened tab still needs its first design; only later polls skip hidden tabs.
    if (disposed || running || (!initial && document.hidden)) return;
    running = true;
    try {
      const snapshot = await service.read();
      if (disposed) return;
      const next = JSON.stringify(snapshot.config);
      if (next !== previous) {
        applyDesign(snapshot.config); onChange(snapshot.config); previous = next;
      }
      // Reveal in the same task, after the caller has rendered the matching section order.
      designReady();
    } finally { running = false; }
  };
  // Never show a guessed default on failure: it would flash again when the saved theme arrives.
  try { await refresh(true); } catch (error) { designFailed(); onChange(null, error); }
  const background = () => refresh().catch(() => {});
  const timer = setInterval(background, 60000);
  window.addEventListener('focus', background);
  document.addEventListener('visibilitychange', background);
  return () => { disposed = true; clearInterval(timer); window.removeEventListener('focus', background); document.removeEventListener('visibilitychange', background); };
}
