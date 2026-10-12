/**
 * Purpose: display isolated sample layouts without loading Auth or any write service.
 * Depends on: the same public renderer and design runtime used by actual website shells.
 * Debug: only same-origin messages from the embedding parent with its channel are accepted.
 */
import { applyDesign } from './runtime.js?v=96b812c63105';
import { designReady } from './boot.js?v=96b812c63105';
import { publicHome } from './public-renderer.js?v=96b812c63105';
import { SAMPLE_SETTINGS, SAMPLE_CONTENT } from './sample.js?v=96b812c63105';
import { accessSurface } from './access-renderer.js?v=96b812c63105';
import { staffPreview } from './staff-preview.js?v=96b812c63105';
import { publicHeader, publicFooter, contentCard, SECTIONS } from './public-renderer.js?v=96b812c63105';
import { element as el } from '../core/dom.js?v=96b812c63105';
const channel = new URLSearchParams(location.search).get('channel');
const root = document.querySelector('#preview-root');
let design;
let covers = [];
let surface = 'public';
let route = 'home';
const render = config => {
  design = applyDesign(config);
  if (['login', 'signup', 'activation'].includes(surface)) root.replaceChildren(accessSurface(surface, SAMPLE_SETTINGS, { preview: true }));
  else if (['admin', 'editor'].includes(surface)) root.replaceChildren(staffPreview(surface));
  else if (route === 'home') root.replaceChildren(publicHome(SAMPLE_SETTINGS, SAMPLE_CONTENT, design, { preview: true, covers }));
  else {
    const page = el('div', '', { class: 'public-surface' });
    const main = el('main', '', { class: 'container page-content' });
    main.append(el('h1', SECTIONS[route][1], { class: 'page-heading' }));
    const cards = el('div', '', { class: 'cards' }); SAMPLE_CONTENT[route].forEach(row => cards.append(contentCard(route, row))); main.append(cards);
    page.append(publicHeader(SAMPLE_SETTINGS, route), main, publicFooter(SAMPLE_SETTINGS, { preview: true })); root.replaceChildren(page);
  }
  designReady();
};
// Wait for the parent's current draft; painting a default here causes a preset/color flash.
window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== parent || !channel || event.data?.channel !== channel || event.data?.type !== 'brgy-design-preview') return;
  if (surface !== event.data.surface) route = 'home';
  surface = ['public', 'admin', 'editor', 'login', 'signup', 'activation'].includes(event.data.surface) ? event.data.surface : 'public';
  covers = Array.isArray(event.data.covers) ? event.data.covers : [];
  render(event.data.config);
});
// Preview links remain inside the preview; they must never take the admin to a live form.
document.addEventListener('click', event => {
  const link = event.target.closest('a');
  if (!link) return;
  event.preventDefault();
  const next = link.getAttribute('href')?.replace(/^#/, '');
  if (surface === 'public' && (next === 'home' || Object.hasOwn(SECTIONS, next))) { route = next; render(design); window.scrollTo(0, 0); }
});
// Capture stops the public renderer changing hashes or dispatching real form operations.
document.addEventListener('submit', event => { event.preventDefault(); event.stopImmediatePropagation(); if (surface === 'public') { route = 'services'; render(design); } }, true);
parent.postMessage({ type: 'brgy-design-ready', channel }, location.origin);
