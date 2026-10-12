/**
 * Purpose: real staff summaries, content/ID analysis and System Admin service-usage display.
 * Depends on: existing aggregate/list services and lightweight UI components; no sample live data.
 * Debug: missing values stay unavailable; section errors do not erase successful sections.
 */
import { element as el, safeLink } from '../core/dom.js?v=96b812c63105';
import { CONTENT } from '../data/contracts.js?v=96b812c63105';
import { formatBytes, GITHUB_REPO } from '../data/usage.js?v=96b812c63105';
import { heading, metric, barChart, button, badge, dateText } from './ui.js?v=96b812c63105';

/** Dashboard data is queried only on entry/refresh, not continuously in the background. */
export function mountDashboard(root, services, isAdmin, isCurrent) {
  let disposed = false, sequence = 0;
  const slots = el('div', '', { class: 'dashboard-content' });
  const refresh = button('↻ Refresh overview', load);
  heading(root, 'Dashboard overview', isAdmin ? 'Your barangay content, ID records and priorities in one place.' : 'Your content workspace. Keep public information up to date.', [el('a', 'View public website ↗', { href: '../index.html', target: '_blank', rel: 'noopener', class: 'button' }), refresh]);
  root.append(slots);
  async function load() {
    const request = ++sequence; refresh.disabled = true; slots.replaceChildren(el('p', 'Loading current totals…', { class: 'notice' }));
    const [content, directory, ids, accounts] = await Promise.allSettled([services.content.overview(), services.directory.overview(), isAdmin ? services.verification.overview() : Promise.resolve(null), isAdmin ? services.editors.list() : Promise.resolve(null)]);
    if (disposed || !isCurrent() || request !== sequence) return;
    slots.replaceChildren();
    const cards = el('div', '', { class: 'metric-grid' });
    if (content.status === 'fulfilled') {
      // The old officials table is retained for recovery, but live personnel counts
      // now come from verification records through the privacy-limited Directory RPC.
      const rows = content.value.filter(row => row.table !== 'officials');
      const directoryRows = directory.status === 'fulfilled' ? directory.value.map(row => ({ ...row, table: `directory-${row.section}`, recent: [] })) : [];
      const metricRows = [...rows, ...directoryRows];
      const total = metricRows.length && metricRows.every(r => r.total != null) ? metricRows.reduce((n, r) => n + r.total, 0) : null;
      const published = metricRows.length && metricRows.every(r => r.published != null) ? metricRows.reduce((n, r) => n + r.published, 0) : null;
      cards.append(metric('Published content', published, 'Visible to residents', 'highlight'), metric('Drafts & hidden', total != null && published != null ? total - published : null, 'Ready for your review'), metric('Content modules', metricRows.length, 'Connected to existing data'));
      if (isAdmin) {
        const pending = accounts.status === 'fulfilled' ? (accounts.value.applications || []).filter(row => row.status === 'pending').length : null;
        cards.append(metric('Pending applications', pending, 'Content Admin access requests'));
      }
      slots.append(cards);
      const graphs = el('div', '', { class: 'dashboard-grid' });
      graphs.append(barChart('Public content by module', metricRows.map(r => ({ label: r.label, value: r.published })), 'Current published / active records. Not page visits.'));
      const recent = el('section', '', { class: 'dashboard-panel' }); recent.append(el('h3', 'Recent content updates'));
      const activity = rows.flatMap(r => r.recent).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 6);
      if (!activity.length) recent.append(el('p', 'Updates appear here after content is added or edited.', { class: 'empty' }));
      activity.forEach(item => { const line = el('a', '', { class: 'activity-item', href: `#${item.table}` }); line.append(el('strong', item.title || CONTENT[item.table].label), el('small', `${CONTENT[item.table].label} · ${dateText(item.at)}`)); recent.append(line); });
      graphs.append(recent); slots.append(graphs);
      if (rows.some(row => row.error) || directory.status === 'rejected') slots.append(el('p', 'Some content metrics could not be loaded. Refresh to retry; missing values are not counted as zero.', { class: 'notice' }));
    } else slots.append(el('p', 'Content overview unavailable: ' + content.reason.message, { class: 'notice' }));
    if (isAdmin) {
      if (ids.status === 'fulfilled') {
        const data = ids.value; const idCards = el('div', '', { class: 'metric-grid' });
        idCards.append(metric('Registered IDs', data.total, 'Existing verification records'), metric('Valid IDs', data.valid, 'Active and not expired', 'highlight'), metric('Expired IDs', data.expired, 'Review for renewal'), metric('Expiring in 30 days', data.due, 'Including today'));
        const graphs = el('div', '', { class: 'dashboard-grid' }); graphs.append(barChart('IDs acquired · last 6 months', data.monthly, 'Based on Date Acquired, not record creation date.'), barChart('ID validity breakdown', [{ label: 'Valid', value: data.valid }, { label: 'Expired', value: data.expired }, { label: 'Inactive / other', value: data.other }]));
        slots.append(el('h3', 'ID management'), idCards, graphs);
      } else slots.append(el('p', 'ID analysis unavailable: ' + ids.reason.message, { class: 'notice' }));
      const quick = el('div', '', { class: 'quick-actions' });
      [['verification', 'Manage IDs & QR →'], ['covers', 'Update cover photos →'], ['usage', 'System status & usage →'], ['design-studio', 'Open Design Studio →']].forEach(([route, title]) => quick.append(el('a', title, { href: `#${route}`, class: 'button' }))); slots.append(quick);
    }
    slots.append(el('p', `Last refreshed ${new Date().toLocaleTimeString('en-PH')}. Counts reflect current records; deleted history is not reconstructed.`, { class: 'muted compact' })); refresh.disabled = false;
  }
  load(); return () => { disposed = true; sequence++; };
}

/** Show measured metadata separately from unavailable private provider billing/quota data. */
export function mountUsage(root, services, isCurrent) {
  let disposed = false;
  const slot = el('div'); const refresh = button('↻ Refresh status', () => load(true));
  heading(root, 'System status & usage', 'Storage consumed is different from money billed. No private provider keys are stored in this website.', [refresh]); root.append(slot);
  async function load(force = false) {
    refresh.disabled = true; slot.replaceChildren(el('p', 'Checking service connections and file metadata…', { class: 'notice' }));
    try {
      const data = await services.usage.read({ force }); if (disposed || !isCurrent()) return; slot.replaceChildren();
      const grid = el('div', '', { class: 'dashboard-grid' });
      const supa = el('section', '', { class: 'dashboard-panel' }); supa.append(el('h3', 'Supabase'), badge(data.supabase ? 'Database connection available' : 'Check unavailable', data.supabase ? 'good' : 'warning'));
      if (data.supabaseError) supa.append(el('p', data.supabaseError, { class: 'notice' }));
      const buckets = data.supabase?.buckets || [];
      const complete = data.supabase && buckets.every(b => b.bytes != null && !b.partial && !b.unknown_files);
      const total = complete ? buckets.reduce((n, b) => n + Number(b.bytes), 0) : null;
      supa.append(metric('Uploaded files · current size', formatBytes(total), 'Metadata total for the four existing website buckets'));
      for (const row of buckets) { const entry = el('div', '', { class: 'usage-row' }); entry.append(el('strong', row.bucket_id), el('span', `${formatBytes(row.bytes)}${row.partial || row.unknown_files ? ' (partial)' : ''} · ${row.files ?? '—'} files`)); if (row.error) entry.append(el('small', row.error)); supa.append(entry); }
      supa.append(el('p', 'Database disk size, plan allowance, bandwidth and remaining quota: not available through the existing website connection.', { class: 'notice' }), safeLink('https://supabase.com/dashboard/project/pkvorwvkqjnbgktkgjhr', 'Open official Supabase dashboard ↗'));
      const git = el('section', '', { class: 'dashboard-panel' }); git.append(el('h3', 'GitHub'), badge(data.github ? 'Repository connection available' : 'Check unavailable', data.github ? 'good' : 'warning'));
      if (data.githubError) git.append(el('p', data.githubError, { class: 'notice' }));
      git.append(metric('Repository size', formatBytes(data.github?.bytes), 'GitHub-reported size; not a billable storage allowance'));
      git.append(el('p', 'Last code update: ' + dateText(data.github?.pushedAt)), el('p', 'Latest Pages deployment: ' + (data.github?.deployment?.state || 'Not available')));
      if (data.github?.deployment?.at) git.append(el('small', dateText(data.github.deployment.at)));
      if (data.github?.deploymentError) git.append(el('p', data.github.deploymentError, { class: 'notice' }));
      git.append(safeLink(`https://github.com/${GITHUB_REPO}/actions`, 'View deployments on GitHub ↗')); grid.append(supa, git); slot.append(grid);
      const billing = el('section', '', { class: 'dashboard-panel' }); billing.append(el('h3', 'Billing & spending'), metric('Actual charges', 'Not connected', 'Not ₱0. The website has no authorized billing connection.'), el('p', 'Official invoices and quotas stay in your provider accounts. No estimated charges or made-up limits are shown.'), safeLink('https://github.com/settings/billing', 'Open GitHub billing ↗'));
      slot.append(billing, el('p', `Last checked: ${new Date(data.checkedAt).toLocaleString('en-PH')}. Refresh is limited to once per minute to save bandwidth.`, { class: 'muted compact' }));
    } catch (error) { if (!disposed && isCurrent()) slot.replaceChildren(el('p', error.message, { class: 'notice' })); }
    finally { refresh.disabled = false; }
  }
  load(); return () => { disposed = true; };
}
