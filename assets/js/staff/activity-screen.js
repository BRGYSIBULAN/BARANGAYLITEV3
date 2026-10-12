/**
 * Purpose: separate Public View, Content Admin, and System Admin activity with period analysis.
 * Depends on: activity data service, native controls, and privacy-safe aggregated public metrics.
 * Debug: verify the selected scope/period, RLS visibility, and delete RPC audit trail.
 */
import { element as el } from '../core/dom.js?v=96b812c63105';
import { ACTIVITY_PERIODS } from '../data/activity.js?v=96b812c63105';
import { heading, button, metric, barChart, recordTable, confirmationDialog, badge } from './ui.js?v=96b812c63105';

const SCOPES = Object.freeze([
  { key: 'public_analytics', label: 'Public View', description: 'Anonymous page, download, and verification-result counters. No visitor names or device identifiers are stored.' },
  { key: 'content_admin', label: 'Content Admin', description: 'Database changes and staff-session events performed by Content Admin accounts.' },
  { key: 'system_admin', label: 'System Admin', description: 'Protected settings, account, permission, ID, and management actions.' },
]);

function readable(value) {
  return String(value || '').replaceAll('.', ' · ').replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase());
}

function dateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Invalid date' : date.toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });
}

function summarize(rows, key, value = () => 1) {
  const counts = new Map();
  rows.forEach(row => counts.set(row[key], (counts.get(row[key]) || 0) + Number(value(row) || 0)));
  return [...counts].sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label: readable(label), value: count }));
}

export function mountActivity(root, services, isCurrent) {
  let disposed = false, request = 0, scope = 'public_analytics', period = 'daily', busy = false;
  const active = () => !disposed && isCurrent();
  const refresh = button('↻ Refresh activity', () => load());
  heading(root, 'Activity & analytics', 'Review separate public, Content Admin, and System Admin activity. Deletions require confirmation and leave a deletion-audit record.', [refresh]);

  const controls = el('section', '', { class: 'activity-controls dashboard-panel' });
  const tabs = el('div', '', { class: 'activity-tabs', role: 'tablist', 'aria-label': 'Activity category' });
  const scopeButtons = new Map();
  SCOPES.forEach(item => {
    const control = el('button', item.label, { type: 'button', role: 'tab', 'aria-selected': String(item.key === scope) });
    control.addEventListener('click', () => { scope = item.key; scopeButtons.forEach((node, key) => node.setAttribute('aria-selected', String(key === scope))); load(); });
    scopeButtons.set(item.key, control); tabs.append(control);
  });
  const periodField = el('div', '', { class: 'activity-period' });
  const select = el('select', '', { id: 'activity-period', 'aria-label': 'Analysis period' });
  ACTIVITY_PERIODS.forEach(item => select.append(el('option', item.label, { value: item.key })));
  select.addEventListener('change', () => { period = select.value; load(); });
  periodField.append(el('label', 'Analyzer period', { for: 'activity-period' }), select);
  controls.append(tabs, periodField);

  const description = el('p', '', { class: 'notice activity-description' });
  const output = el('div', '', { class: 'activity-output' });
  const deletionHistory = el('section', '', { class: 'dashboard-panel activity-deletions' });
  root.append(controls, description, output, deletionHistory);

  async function deleteSelected() {
    if (busy || !active()) return;
    const selected = SCOPES.find(item => item.key === scope);
    const chosenPeriod = ACTIVITY_PERIODS.find(item => item.key === period)?.label || period;
    const confirmed = await confirmationDialog({
      title: `Delete ${selected.label} ${chosenPeriod.toLowerCase()} records?`,
      description: `Only records inside the currently selected ${chosenPeriod.toLowerCase()} period will be removed. A permanent deletion-audit entry with the category, range, and deleted count will remain.`,
      confirmLabel: 'Delete selected records', destructive: true,
    });
    if (!confirmed || !active()) return;
    busy = true;
    try {
      const removed = scope === 'public_analytics' ? await services.activity.deletePublic(period) : await services.activity.deleteStaff(scope, period);
      if (!active()) return;
      description.textContent = `${removed} selected record${removed === 1 ? '' : 's'} deleted. The deletion itself remains in the audit trail.`;
      await load();
    } catch (error) { if (active()) description.textContent = 'Delete failed: ' + error.message; }
    finally { busy = false; }
  }

  async function drawDeletionHistory() {
    try {
      const rows = await services.activity.deletions(); if (!active()) return;
      deletionHistory.replaceChildren(el('h2', 'Deletion audit trail'));
      if (!rows.length) { deletionHistory.append(el('p', 'No activity ranges have been deleted.', { class: 'empty' })); return; }
      deletionHistory.append(recordTable(rows, [
        { key: 'occurred_at', label: 'Deleted at', render: row => dateTime(row.occurred_at) },
        { key: 'target_scope', label: 'Category', render: row => readable(row.target_scope) },
        { key: 'period_from', label: 'From', render: row => dateTime(row.period_from) },
        { key: 'period_to', label: 'To', render: row => dateTime(row.period_to) },
        { key: 'deleted_count', label: 'Removed' },
      ], () => []));
    } catch (error) { if (active()) deletionHistory.replaceChildren(el('h2', 'Deletion audit trail'), el('p', error.message, { class: 'notice' })); }
  }

  async function load() {
    const sequence = ++request; refresh.disabled = true; select.disabled = true;
    scopeButtons.forEach(control => { control.disabled = true; });
    const selected = SCOPES.find(item => item.key === scope);
    description.textContent = selected.description;
    output.replaceChildren(el('p', 'Loading selected activity…', { class: 'notice' }));
    try {
      if (scope === 'public_analytics') {
        const data = await services.activity.publicMetrics(period); if (!active() || sequence !== request) return;
        const total = data.rows.reduce((sum, row) => sum + Number(row.event_count || 0), 0);
        const summary = summarize(data.rows, 'metric_key', row => row.event_count);
        const cards = el('div', '', { class: 'metric-grid' });
        cards.append(metric('Recorded public events', total, `${ACTIVITY_PERIODS.find(item => item.key === period).label} Manila period`, 'highlight'), metric('Tracked public actions', summary.length, 'Only approved anonymous counters'));
        const actions = el('div', '', { class: 'cluster activity-delete-row' });
        actions.append(badge('Privacy-safe aggregate', 'good'), button('Delete selected period', deleteSelected));
        output.replaceChildren(cards, barChart('Public activity breakdown', summary.slice(0, 20), 'Counts only; no public visitor identity, IP address, or free-text input is stored.'), actions);
        if (data.rows.length) output.append(recordTable(data.rows, [
          { key: 'metric_date', label: 'Date' },
          { key: 'metric_key', label: 'Activity', render: row => readable(row.metric_key) },
          { key: 'event_count', label: 'Count' },
        ], () => []));
      } else {
        const data = await services.activity.staff(scope, period); if (!active() || sequence !== request) return;
        const summary = summarize(data.rows, 'module');
        const cards = el('div', '', { class: 'metric-grid' });
        cards.append(metric('Recorded staff actions', data.count, `${ACTIVITY_PERIODS.find(item => item.key === period).label} Manila period`, 'highlight'), metric('Active modules', summary.length, 'Based on the loaded activity rows'));
        const actions = el('div', '', { class: 'cluster activity-delete-row' }); actions.append(button('Delete selected period', deleteSelected));
        output.replaceChildren(cards, barChart(`${selected.label} activity by module`, summary.slice(0, 20)), actions);
        if (data.rows.length) output.append(recordTable(data.rows, [
          { key: 'occurred_at', label: 'Date & time', render: row => dateTime(row.occurred_at) },
          { key: 'actor_name', label: 'Account' },
          { key: 'action', render: row => readable(row.action) },
          { key: 'module', render: row => readable(row.module) },
          { key: 'summary' },
        ], () => []));
        else output.append(el('p', 'No staff activity in this selected period.', { class: 'empty' }));
      }
      await drawDeletionHistory();
    } catch (error) { if (active() && sequence === request) output.replaceChildren(el('p', error.message, { class: 'notice' })); }
    finally {
      if (active() && sequence === request) { refresh.disabled = false; select.disabled = false; scopeButtons.forEach(control => { control.disabled = false; }); }
    }
  }

  load();
  return () => { disposed = true; request++; };
}
