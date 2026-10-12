/**
 * Purpose: sample staff shell matching live workspace classes without private queries.
 * Depends on: central CSS and DOM helpers; none of the values represent private records.
 * Debug: counts are omitted; navigation cannot grant access in this isolated preview.
 */
import { element as el } from '../core/dom.js?v=96b812c63105';
import { metric, barChart } from '../staff/ui.js?v=96b812c63105';
export function staffPreview(mode) {
  const root = el('div', '', { class: 'workspace' });
  const role = mode === 'admin' ? 'System Admin' : 'Content Admin';
  const header = el('header', '', { class: 'workspace-header' });
  header.append(el('strong', 'BRGYWEBLITEV3'), el('p', `${role} · Sample workspace`));
  const nav = el('nav', '', { class: 'workspace-nav', 'aria-label': `${role} preview modules` });
  const list = el('ul');
  const labels = ['Dashboard', 'Announcements', 'Services', 'Officials', 'Directory', 'Transparency', 'Forms', 'Gallery'];
  if (mode === 'admin') labels.push('Design Studio', 'Page Settings', 'Content Admin Accounts');
  labels.forEach((label, index) => { const li = el('li'); li.append(el('a', label, { href: '#', 'aria-current': index === 0 ? 'page' : null, 'aria-disabled': 'true', title: 'Preview only. Use the live workspace to edit.' })); list.append(li); });
  nav.append(list);
  const main = el('main', '', { class: 'workspace-main' });
  main.append(el('p', `${role.toUpperCase()} / OVERVIEW`, { class: 'eyebrow muted' }), el('h1', 'Dashboard overview'), el('p', 'Your barangay content and priorities in one place.', { class: 'muted' }));
  const cards = el('div', '', { class: 'metric-grid' });
  cards.append(metric('Published content', '—', 'Actual totals after sign-in', 'highlight'), metric('Drafts & hidden', '—', 'Ready for review'), metric('Content modules', '8', 'Connected public modules'), metric(mode === 'admin' ? 'Registered IDs' : 'Recent updates', '—', 'Existing records only'));
  const graphs = el('div', '', { class: 'dashboard-grid' });
  graphs.append(barChart('Public content by module', [{ label: 'Announcements', value: 12 }, { label: 'Services', value: 8 }, { label: 'Forms', value: 6 }, { label: 'Gallery', value: 4 }], 'Sample chart for design preview only. These are not live counts.'));
  const panel = el('section', '', { class: 'dashboard-panel' }); panel.append(el('h3', 'Your working tools'));
  ['Search and edit public content', 'Compress uploaded photos', mode === 'admin' ? 'Manage ID records and download QR codes' : 'Publish approved barangay information', mode === 'admin' ? 'View storage and deployment status' : 'Review drafts before publishing'].forEach(text => panel.append(el('p', text, { class: 'activity-item' })));
  graphs.append(panel);
  main.prepend(el('p', 'Sample preview — navigation and settings are not editable here. Use “Open live Page Settings” above the preview to make real changes.', { class: 'notice' }));
  main.append(cards, graphs, el('p', 'Preview only · Access rules and account roles do not change with a theme.', { class: 'notice' }));
  root.append(header, nav, main); return root;
}
