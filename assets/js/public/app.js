/**
 * Purpose: show the selected public layout using only existing published Supabase records.
 * Depends on: service container, shared design renderers/runtime, cover watcher, and hash router.
 * Debug: section failures are visible; cover refreshes read the existing dashboard record only.
 */
import { getServices } from '../core/services.js?v=96b812c63105';
import { CONTENT, DIRECTORY_GROUPS } from '../data/contracts.js?v=96b812c63105';
import { element as el, safeLink } from '../core/dom.js?v=96b812c63105';
import { startRouter } from '../core/router.js?v=96b812c63105';
import { watchDesign } from '../design/runtime.js?v=96b812c63105';
import { beginDesignLoad, designFailed } from '../design/boot.js?v=96b812c63105';
import { presetDesign } from '../design/model.js?v=96b812c63105';
import { publicHome, publicHeader, publicFooter, contentCard, officialsRoster } from '../design/public-renderer.js?v=96b812c63105';
import { watchAvailability, maintenanceSurface } from './availability.js?v=96b812c63105';
import { watchCovers } from './carousel.js?v=96b812c63105';
import { installPhotoViewer } from './photo-viewer.js?v=96b812c63105';
import { defaultVisibility, hiddenDirectoryGroups, moduleVisible } from '../data/visibility.js?v=96b812c63105';
import { watchVisibility, unavailableSurface } from './visibility.js?v=96b812c63105';

const PUBLIC_ROUTES = Object.freeze({
  announcements: { table: 'announcements', title: 'News & Updates' },
  services: { table: 'services', title: 'Barangay Services' },
  appointment: { table: 'services', title: 'Request Appointment', search: 'appointment', intro: 'Read the published appointment instructions, then contact the Barangay Hall through the official details below. This page does not collect payments.' },
  forms: { table: 'forms', title: 'Downloadable Forms' },
  contact: { title: 'Contact Us', contact: true },
  pages: { table: 'pages', title: 'Barangay Profile', intro: 'Published barangay profile and development information based on the BDP 2026.' },
  officials: { table: 'officials', directorySection: 'officials', title: 'Barangay Officials', roster: true },
  staff: { table: 'directory_entries', directorySection: 'staff', title: 'Barangay Staff', grouped: true, intro: 'Published personnel assigned to the Barangay Local Government Unit.' },
  functionaries: { table: 'directory_entries', directorySection: 'functionaries', title: 'Barangay Functionaries', grouped: true, intro: 'Published functionary groups and members using the exact headings saved by the barangay.' },
  disclosures: { table: 'disclosures', title: 'Transparency & Reports' },
  gallery_items: { table: 'gallery_items', title: 'Community Gallery' },
  directory_entries: { table: 'directory_entries', title: 'Contact Directory', categories: DIRECTORY_GROUPS.contacts },
});
const publicRoute = route => PUBLIC_ROUTES[route] || null;

/** Maintenance and published flags stay authoritative regardless of the selected theme. */
export async function startPublicPage({ services: injectedServices } = {}) {
  // Also re-arm after a Back/Forward-cache restore before rechecking the published design.
  beginDesignLoad();
  const root = document.querySelector('#public-root');
  const status = document.querySelector('#status');
  let config = presetDesign();
  let settings;
  let visibility = defaultVisibility(), visibilityError;
  let homeData;
  let currentRoute;
  let homeErrors = {};
  let covers = [], homeCleanup;
  let stopAvailability, stopVisibility, stopCovers, stopRouter, stopDesign, stopMetricClicks, disposed = false;
  const stopPhotoViewer = installPhotoViewer(root);
  const showHome = () => { homeCleanup?.(); const home = publicHome(settings, homeData, config, { errors: homeErrors, covers, visibility }); root.replaceChildren(home); homeCleanup = home.dispose; };
  const cleanup = () => { disposed = true; stopAvailability?.(); stopVisibility?.(); stopCovers?.(); stopRouter?.(); stopDesign?.(); stopMetricClicks?.(); homeCleanup?.(); stopPhotoViewer(); };
  window.addEventListener('pagehide', cleanup, { once: true });
  try {
    const services = injectedServices || getServices();
    const metricClick = event => {
      const key = event.target.closest?.('[data-public-metric]')?.dataset.publicMetric;
      if (key) services.activity?.recordPublic?.(key).catch(() => {});
    };
    root.addEventListener('click', metricClick);
    stopMetricClicks = () => root.removeEventListener('click', metricClick);
    const visibilityService = services.visibility || { read: async () => ({ config: defaultVisibility() }) };
    stopCovers = watchCovers(services.covers, next => {
      covers = next;
      // Rebuild only the active homepage; its prior carousel timer is disposed by showHome().
      if (settings?.maintenance_mode === false && currentRoute === 'home' && homeData) showHome();
    });
    document.querySelector('.skip-link')?.addEventListener('click', event => { event.preventDefault(); document.querySelector('#public-main')?.focus(); });
    const openPublic = () => { stopRouter = startRouter(async (route, isCurrent) => {
      // Each public navigation checks availability before requesting any content rows.
      const [latest, latestVisibility] = await Promise.all([stopAvailability.refresh(), stopVisibility.refresh()]);
      if (!isCurrent() || !latest || latest.maintenance_mode || !latestVisibility) return;
      visibility = latestVisibility;
      homeCleanup?.(); homeCleanup = undefined;
      currentRoute = route; status.textContent = 'Loading published information…';
      try {
        if (route === 'home') {
          // Always start from the dashboard's current saved cover record; no hardcoded hero path.
          homeData = null;
          try { covers = await stopCovers.refresh(); if (!isCurrent()) return; }
          catch { covers = []; }
          if (!isCurrent()) return;
          // Officials now come from existing ID people through a public-safe RPC;
          // the old officials table is left untouched and is no longer duplicated here.
          const visibleTables = Object.keys(CONTENT).filter(table => table !== 'officials' && moduleVisible(visibility, table));
          const results = await Promise.all(visibleTables.map(async table => {
            const options = table === 'directory_entries' ? { categories: DIRECTORY_GROUPS.contacts } : {};
            try { return { table, data: await services.content.list(table, { publicOnly: true, pageSize: 3, ...options }) }; }
            catch { return { table, error: true }; }
          }));
          if (moduleVisible(visibility, 'officials')) {
            try { results.push({ table: 'officials', data: await services.directory.listPublic({ section: 'officials', pageSize: 3 }) }); }
            catch { results.push({ table: 'officials', error: true }); }
          }
          if (!isCurrent()) return;
          homeData = {}; homeErrors = {};
          results.forEach(({ table, data, error }) => { homeData[table] = data?.rows || []; if (error) homeErrors[table] = true; });
          showHome();
        } else {
          const routeInfo = publicRoute(route);
          if (!routeInfo) throw new Error('Page not found. Choose a public information page from the navigation.');
          if (!moduleVisible(visibility, route)) {
            root.replaceChildren(unavailableSurface(settings));
            document.title = routeInfo.title + ' unavailable — Barangay ' + settings.barangay_name;
            status.textContent = '';
            return;
          }
          const shell = el('div', '', { class: 'public-surface' });
          const main = el('main', '', { id: 'public-main', tabindex: '-1', class: 'container page-content' });
          main.append(el('h1', routeInfo.title, { class: 'page-heading' }));
          if (routeInfo.intro) main.append(el('p', routeInfo.intro, { class: 'page-intro muted' }));
          if (routeInfo.contact) {
            const panel = el('section', '', { class: 'contact-panel dashboard-panel' });
            panel.append(el('h2', 'Barangay Hall contact details'));
            const details = [
              ['Address', settings.address || [settings.barangay_name, settings.municipality_city, settings.province].filter(Boolean).join(', ')],
              ['Contact number', settings.contact_number],
              ['Email', settings.email],
            ].filter(([, value]) => value);
            details.forEach(([label, value]) => { const row = el('div', '', { class: 'setting-row' }); row.append(el('small', label), el('p', value)); panel.append(row); });
            if (settings.facebook_url) panel.append(safeLink(settings.facebook_url, 'Open official Facebook page ↗'));
            if (!details.length && !settings.facebook_url) panel.append(el('p', 'Contact information has not been published yet.', { class: 'empty' }));
            main.append(panel); shell.append(publicHeader(settings, route, visibility), main, publicFooter(settings, { visibility })); root.replaceChildren(shell);
          } else {
          let page = 0;
          const query = new URLSearchParams(location.hash.split('?')[1] || '').get('q') || '';
          if (route === 'services') main.append(el('p', 'Service information only. This website does not collect online payments. Complete any required transaction directly at the Barangay Hall and request an official receipt.', { class: 'notice service-payment-notice' }));
          const summary = el('p', '', { role: 'status', class: 'muted' });
          const cards = el('div', '', { class: routeInfo.roster ? 'officials-roster-host' : routeInfo.grouped ? 'directory-groups' : 'cards' });
          const groups = new Map();
          const loadedRows = [];
          const more = el('button', 'Load more', { type: 'button' });
          if (route === 'services') {
            const search = el('form', '', { role: 'search', class: 'service-search' });
            search.append(el('label', 'Search service names', { for: 'service-filter', class: 'sr-only' }), el('input', '', { id: 'service-filter', name: 'q', type: 'search', value: query, maxlength: 100, placeholder: 'Search service names…' }), el('button', 'Search', { type: 'submit', class: 'primary' }));
            search.addEventListener('submit', event => { event.preventDefault(); location.hash = 'services?q=' + encodeURIComponent(search.elements.q.value.trim()); }); main.append(search);
          }
          main.append(summary, cards, more); shell.append(publicHeader(settings, route, visibility), main, publicFooter(settings, { visibility })); root.replaceChildren(shell);
          const appendRow = row => {
            if (!routeInfo.grouped) { cards.append(contentCard(routeInfo.table, row)); return; }
            const category = row.category || 'Other';
            let group = groups.get(category);
            if (!group) {
              const section = el('section', '', { class: 'directory-group' });
              group = el('div', '', { class: 'cards' }); section.append(el('h2', category), group);
              groups.set(category, group); cards.append(section);
            }
            group.append(contentCard(routeInfo.table, row));
          };
          const load = async () => {
            more.disabled = true;
            try {
              // The route already checked its first page; subsequent loads recheck explicitly.
              if (page > 0) {
                const [currentSettings, currentVisibility] = await Promise.all([stopAvailability.refresh(), stopVisibility.refresh()]);
                if (!isCurrent() || !currentSettings || currentSettings.maintenance_mode || !currentVisibility || !moduleVisible(currentVisibility, route)) return;
              }
              const searchValue = routeInfo.search || (route === 'services' ? query : '');
              const hiddenGroups = hiddenDirectoryGroups(visibility);
              const categories = (routeInfo.categories || []).filter(category => !hiddenGroups.includes(category));
              const excludeCategories = [...(routeInfo.excludeCategories || []), ...hiddenGroups];
              const data = routeInfo.directorySection
                ? await services.directory.listPublic({ section: routeInfo.directorySection, page, pageSize: 50, excludedSubcategories: hiddenGroups })
                : routeInfo.categories?.length && !categories.length
                  ? { rows: [], count: 0 }
                  : await services.content.list(routeInfo.table, { publicOnly: true, page, search: searchValue, categories, excludeCategories, alphabetical: routeInfo.alphabetical === true });
              if (!isCurrent()) return;
              if (routeInfo.roster) {
                // Rebuild the lightweight hierarchy after each page so position tiers stay ordered.
                loadedRows.push(...data.rows); cards.replaceChildren(officialsRoster(loadedRows));
              } else data.rows.forEach(appendRow);
              if (page === 0 && !data.rows.length) cards.append(el('p', route === 'appointment' ? 'Appointment instructions have not been published yet. Please use the Contact Us page to reach the Barangay Hall.' : query ? 'No matching published services.' : 'No published records in this section yet.', { class: 'empty' }));
              page++; summary.textContent = data.count + ' published ' + ((query || routeInfo.search) ? 'matching ' : '') + 'records'; more.hidden = page * 50 >= data.count;
            } finally { more.disabled = false; }
          };
          more.addEventListener('click', () => load().catch(error => { if (isCurrent()) status.textContent = 'Could not load more: ' + error.message; }));
          await load();
          }
        }
        if (isCurrent()) {
          document.title = (route === 'home' ? 'Home' : publicRoute(route).title) + ' — Barangay ' + settings.barangay_name; status.textContent = '';
          // Public analytics stores one approved counter only—never visitor identity or search text.
          services.activity?.recordPublic?.(`page.${route}`).catch(() => {});
        }
        if (route === 'home') {
          const ownedCleanup = homeCleanup;
          return () => { ownedCleanup?.(); if (homeCleanup === ownedCleanup) homeCleanup = undefined; };
        }
      } catch (error) {
        if (!isCurrent()) return;
        status.textContent = error.message;
        if (!publicRoute(route) && route !== 'home') root.replaceChildren(publicHeader(settings, 'home', visibility), el('p', error.message, { class: 'container notice' }));
      }
    }, 'home'); };
    stopVisibility = watchVisibility(visibilityService, (next, error) => {
      visibility = next; visibilityError = error;
      // A changed switch rebuilds the current hash route; no full-page reload is required.
      if (settings?.maintenance_mode === false) {
        stopRouter?.(); stopRouter = undefined; homeCleanup?.(); homeCleanup = undefined;
        currentRoute = undefined; homeData = null; root.replaceChildren(); status.textContent = '';
        if (next) openPublic();
        else root.replaceChildren(unavailableSurface(settings, { error, retry: () => stopVisibility.refresh() }));
      }
    });
    await stopVisibility.refresh();
    if (!visibility) {
      root.replaceChildren(unavailableSurface({}, { error: visibilityError, retry: () => stopVisibility.refresh() }));
    }
    stopAvailability = watchAvailability(services.settings, (next, error) => {
      // Stopping the router invalidates in-flight content responses before hiding the old view.
      stopRouter?.(); stopRouter = undefined; homeCleanup?.(); homeCleanup = undefined;
      currentRoute = undefined; homeData = null; settings = next; root.replaceChildren(); status.textContent = '';
      if (!next || next.maintenance_mode) {
        root.replaceChildren(maintenanceSurface(next || {}, { error, retry: () => stopAvailability.refresh() }));
        document.title = next ? 'Maintenance — Barangay ' + next.barangay_name : 'Website temporarily unavailable';
      } else if (visibility) openPublic();
      else root.replaceChildren(unavailableSurface(next, { error: visibilityError, retry: () => stopVisibility.refresh() }));
    });
    await stopAvailability.refresh();
    if (disposed) return;
    stopDesign = await watchDesign(services.design, (next, error) => {
      if (disposed) return;
      if (next) config = next;
      if (error) status.textContent = 'The saved design could not load. Reload this page to try again.';
      // A late theme response must never put public content back over a maintenance notice.
      if (settings?.maintenance_mode === false && currentRoute === 'home' && homeData) showHome();
    });
    if (disposed) stopDesign();
  } catch (error) {
    if (disposed) return;
    designFailed();
    status.textContent = 'Unable to load barangay information: ' + error.message;
    root.replaceChildren(el('a', 'Retry', { href: 'index.html', class: 'button' }), el('a', 'Admin Portal', { href: 'login.html', class: 'button' }));
  }
  return cleanup;
}
if (typeof document !== 'undefined' && document.querySelector('#public-root')) {
  if (document.readyState !== 'complete') document.addEventListener('DOMContentLoaded', startPublicPage, { once: true });
  else startPublicPage();
  // Back/Forward cache restores a stopped page: hide cached content and recheck availability.
  window.addEventListener('pageshow', event => { if (event.persisted) { document.querySelector('#public-root').replaceChildren(); startPublicPage(); } });
}
