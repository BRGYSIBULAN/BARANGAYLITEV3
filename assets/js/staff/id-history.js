/**
 * Purpose: show a System Admin the actor, time, and field changes for one ID record.
 * Depends on: protected verification.history, shared controls, and the central stylesheet.
 * Debug: check access/query errors first; request generations discard responses after closing.
 */
import { element as el } from '../core/dom.js';
import { VERIFICATION_FIELDS } from '../data/contracts.js';
import { button, labelFor } from './ui.js';

/** Render only known ID fields as text, even if a history payload contains extra properties. */
export function historyEntry(entry) {
  const section = el('section', '', { class: 'dashboard-panel' });
  const operation = { INSERT: 'Created', UPDATE: 'Updated', DELETE: 'Deleted' }[entry.operation] || 'Changed';
  const date = new Date(entry.occurred_at);
  const when = Number.isNaN(date.getTime()) ? 'Unknown time' : date.toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });
  section.append(el('h3', `${operation} by ${entry.actor_name || 'Unknown staff account'}`), el('p', `${when} (Manila) · ${entry.actor_role || 'unknown'}`));
  const table = el('table', '', { class: 'records-table' });
  const head = el('thead'), titles = el('tr');
  ['Field', 'Before', 'After'].forEach(title => titles.append(el('th', title, { scope: 'col' })));
  head.append(titles); table.append(head);
  const body = el('tbody');
  for (const key of VERIFICATION_FIELDS) {
    const before = entry.old_values || {}, after = entry.new_values || {};
    if (!Object.hasOwn(before, key) && !Object.hasOwn(after, key)) continue;
    const row = el('tr'); row.append(el('th', labelFor(key), { scope: 'row' }));
    for (const [values, label] of [[before, 'Before'], [after, 'After']]) row.append(el('td', Object.hasOwn(values, key) ? (values[key] == null || values[key] === '' ? 'Not set' : String(values[key])) : '—', { 'data-label': label }));
    body.append(row);
  }
  table.append(body);
  const scroll = el('div', '', { class: 'table-scroll', tabindex: '0', 'aria-label': 'Field changes' }); scroll.append(table); section.append(scroll);
  return section;
}

/** Return cleanup synchronously so logout/navigation can close pending history requests. */
export function showIdHistory(row, service, isCurrent) {
  let disposed = false, generation = 0, page = 0;
  const dialog = el('dialog', '', { class: 'edit-dialog', 'aria-label': `ID history: ${row.control_number}` });
  const heading = el('div', '', { class: 'dialog-heading' }); heading.append(el('h2', `History: ${row.control_number}`));
  const message = el('p', '', { role: 'status', 'aria-live': 'polite' }), output = el('div');
  const close = () => { disposed = true; generation++; dialog.close(); dialog.remove(); };
  close.canLeave = () => true;
  const previous = button('← Newer', () => load(page - 1)), next = button('Older →', () => load(page + 1));
  const retry = button('Refresh history', () => load(page));
  const actions = el('div', '', { class: 'form-actions' }); actions.append(previous, next, retry, button('Close', close, true));
  dialog.append(heading, el('p', 'Detailed history starts when this feature was enabled. Earlier changes are not available here.', { class: 'muted' }), message, output, actions);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  document.body.append(dialog); dialog.showModal();
  async function load(target) {
    if (disposed || !isCurrent()) return;
    const request = ++generation;
    previous.disabled = next.disabled = retry.disabled = true; message.textContent = 'Loading history…'; output.replaceChildren();
    try {
      const data = await service.history(row.id, { page: target, pageSize: 20 });
      if (disposed || !isCurrent() || request !== generation) return;
      page = target; output.replaceChildren(...data.rows.map(historyEntry));
      message.textContent = data.count ? `${data.count} changes · Page ${page + 1}` : 'No detailed changes recorded yet.';
      previous.disabled = page === 0; next.disabled = (page + 1) * 20 >= data.count;
    } catch (error) {
      if (!disposed && isCurrent() && request === generation) message.textContent = `Could not load history: ${error.message}`;
    } finally { if (!disposed && isCurrent() && request === generation) retry.disabled = false; }
  }
  load(0); return close;
}
