/**
 * Purpose: accessible staff controls, editable dialogs, summaries and lightweight charts.
 * Depends on: native HTML controls and core/dom; no database or framework dependency.
 * Debug: submit errors remain in the dialog; busy/dirty guards protect unfinished edits.
 */
import { element as el } from '../core/dom.js?v=96b812c63105';

/** Human-readable labels are shared by tables and forms. */
export function labelFor(key) {
  return ({ control_number: 'ID number', date_acquired: 'Date acquired', expiration_date: 'Expiration date', is_published: 'Published on public website', is_active: 'Active / visible', is_featured: 'Featured announcement', file_url: 'Document link', cover_url: 'Cover image link', photo_url: 'Photo link', image_url: 'Image link', map_embed_url: 'Google Maps embed URL', sort_order: 'Display order', fee_text: 'Office instructions', municipality_city: 'Municipality / city' })[key] || key.replaceAll('_', ' ').replace(/^./, c => c.toUpperCase());
}
export function button(text, fn, primary = false) { const b = el('button', text, { type: 'button', class: primary ? 'primary' : '' }); b.addEventListener('click', fn); return b; }
export function heading(root, title, description, actions = []) {
  const header = el('div', '', { class: 'module-heading' }); const copy = el('div');
  copy.append(el('p', 'BARANGAY WORKSPACE', { class: 'eyebrow muted' }), el('h1', title), el('p', description, { class: 'muted' }));
  const controls = el('div', '', { class: 'cluster' }); controls.append(...actions); header.append(copy, controls); root.append(header);
}
export function metric(label, value, note = '', tone = '') {
  const card = el('article', '', { class: `metric-card ${tone}` });
  card.append(el('p', label, { class: 'metric-label' }), el('strong', value === null || value === undefined ? '—' : String(value), { class: 'metric-value' }), el('small', note)); return card;
}
export function badge(text, tone = '') { return el('span', text, { class: `status-badge ${tone}` }); }
export function dateText(value) { if (!value) return 'Not set'; const d = new Date(value.length === 10 ? value + 'T12:00:00+08:00' : value); return Number.isNaN(d.getTime()) ? 'Invalid date' : d.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium' }); }

/** Native meter charts expose exact numbers to assistive technology; no chart library. */
export function barChart(title, rows, note = '') {
  const section = el('section', '', { class: 'dashboard-panel' }); section.append(el('h3', title));
  if (note) section.append(el('p', note, { class: 'muted compact' }));
  const max = Math.max(1, ...rows.map(row => Number(row.value) || 0));
  for (const row of rows) {
    const line = el('div', '', { class: 'chart-row' }); const value = row.value;
    line.append(el('span', row.label), el('strong', value == null ? 'Unavailable' : String(value)));
    if (value != null) line.append(el('meter', `${value} of ${max}`, { min: 0, max, value, 'aria-label': row.label }));
    section.append(line);
  }
  if (!rows.length) section.append(el('p', 'No data available.', { class: 'empty' }));
  return section;
}

/** Every column is text-safe; action controls remain separate from the row content. */
export function recordTable(rows, columns, actions) {
  if (!rows.length) return el('div', 'No matching records. Add a record or change your search.', { class: 'empty' });
  const wrap = el('div', '', { class: 'table-scroll', tabindex: '0', 'aria-label': 'Records table; scroll horizontally for more columns' });
  const table = el('table', '', { class: 'records-table' }); table.append(el('caption', `${rows.length} records on this page`, { class: 'sr-only' }));
  const head = el('thead'); const hr = el('tr'); columns.forEach(col => hr.append(el('th', col.label || labelFor(col.key), { scope: 'col' }))); hr.append(el('th', 'Actions', { scope: 'col' })); head.append(hr);
  const body = el('tbody');
  rows.forEach(row => { const tr = el('tr'); columns.forEach(col => { const td = el('td', '', { 'data-label': col.label || labelFor(col.key) }); const value = col.render ? col.render(row) : row[col.key]; if (value instanceof Node) td.append(value); else td.textContent = String(value ?? '—'); tr.append(td); }); const td = el('td', '', { 'data-label': 'Actions' }); const group = el('div', '', { class: 'row-actions' }); group.append(...actions(row)); td.append(group); tr.append(td); body.append(tr); });
  table.append(head, body); wrap.append(table); return wrap;
}

/** Use an in-page confirmation instead of browser popups for explicit admin actions. */
export function confirmationDialog({ title, description, confirmLabel = 'Confirm', destructive = false }) {
  return new Promise(resolve => {
    const dialog = el('dialog', '', { class: 'edit-dialog confirm-dialog', 'aria-label': title });
    const actions = el('div', '', { class: 'form-actions' });
    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true; dialog.close(); dialog.remove(); resolve(result);
    };
    const cancel = button('Cancel', () => finish(false));
    const confirm = el('button', confirmLabel, { type: 'button', class: destructive ? 'danger' : 'primary' });
    confirm.addEventListener('click', () => finish(true));
    dialog.append(el('div', '', { class: 'dialog-heading' }), el('p', description, { class: 'muted' }), actions);
    dialog.querySelector('.dialog-heading').append(el('h2', title));
    actions.append(cancel, confirm);
    dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false); });
    document.body.append(dialog); dialog.showModal(); cancel.focus();
  });
}

/** Read is a first-class CRUD action; operators can inspect every field before editing. */
export function detailsDialog({ title, fields, record }) {
  const dialog = el('dialog', '', { class: 'edit-dialog details-dialog', 'aria-label': title });
  const list = el('dl', '', { class: 'record-details' });
  fields.filter(field => field.key !== 'upload').forEach(field => {
    const value = record[field.key];
    list.append(
      el('dt', field.label || labelFor(field.key)),
      el('dd', typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value ?? '').trim() || 'Not set')
    );
  });
  let closed = false;
  const close = () => { if (closed) return; closed = true; dialog.close(); dialog.remove(); };
  const actions = el('div', '', { class: 'form-actions' });
  actions.append(button('Close', close, true));
  dialog.append(el('div', '', { class: 'dialog-heading' }), list, actions);
  dialog.querySelector('.dialog-heading').append(el('h2', title));
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  document.body.append(dialog); dialog.showModal();
  close.canLeave = () => true;
  return close;
}

/** Fields use typed controls; optional empty values are null, booleans remain booleans. */
export function fieldsForm(fields, original = {}) {
  const form = el('form', '', { class: 'editor-form' }); const controls = new Map();
  for (const def of fields) {
    const id = `field-${def.key}`; const field = el('div', '', { class: `field ${def.wide ? 'field-wide' : ''}` });
    let input;
    if (def.options) { input = el('select', '', { id, name: def.key }); def.options.forEach(option => input.append(el('option', typeof option === 'string' ? option : option.label, { value: typeof option === 'string' ? option : option.value }))); }
    else input = el(def.type === 'textarea' ? 'textarea' : 'input', '', { id, name: def.key, type: def.type === 'textarea' ? null : def.type || 'text', rows: def.type === 'textarea' ? 4 : null, maxlength: def.max || 20000, min: def.type === 'number' ? 0 : null, step: def.type === 'number' ? 1 : null });
    if (def.type === 'checkbox') input.checked = original[def.key] ?? def.default ?? false;
    else if (def.type !== 'file') input.value = original[def.key] ?? def.default ?? '';
    if (def.required) input.required = true;
    if (def.accept) input.accept = def.accept;
    field.append(el('label', def.label || labelFor(def.key), { for: id }), input);
    if (def.suggestions?.length && !def.options) {
      // Datalist keeps the field free-text while offering existing/common headings.
      const listId = `${id}-suggestions`;
      input.setAttribute('list', listId);
      const suggestions = el('datalist', '', { id: listId });
      [...new Set(def.suggestions)].forEach(value => suggestions.append(el('option', '', { value })));
      field.append(suggestions);
    }
    if (def.help) field.append(el('small', def.help));
    controls.set(def.key, input); form.append(field);
  }
  return { form, controls, values() {
    const result = {};
    for (const def of fields) { const input = controls.get(def.key); if (def.type === 'file') continue; result[def.key] = def.type === 'checkbox' ? input.checked : def.type === 'number' ? (input.value === '' ? null : Number(input.value)) : input.value.trim() || null; }
    return result;
  } };
}

/** A single modal owns its asynchronous save and guards closing/back navigation. */
export function editorDialog({ title, fields, original = {}, onSave, afterSave, onMount, description = '', saveLabel = 'Save changes' }) {
  const dialog = el('dialog', '', { class: 'edit-dialog', 'aria-label': title });
  const top = el('div', '', { class: 'dialog-heading' }); top.append(el('h2', title));
  const { form, controls, values } = fieldsForm(fields, original);
  const message = el('p', '', { role: 'status', 'aria-live': 'polite', class: 'form-message' });
  const actions = el('div', '', { class: 'form-actions field-wide' });
  let dirty = false, busy = false, disposed = false;
  const canLeave = () => !busy && (!dirty || confirm('Discard your unsaved changes?'));
  const close = () => { if (canLeave()) dispose(); };
  const cancel = button('Cancel', close); const save = el('button', saveLabel, { type: 'submit', class: 'primary' });
  actions.append(cancel, save); form.append(message, actions); dialog.append(top);
  if (description) dialog.append(el('p', description, { class: 'muted' }));
  dialog.append(form); document.body.append(dialog);
  const beforeUnload = event => { if (dirty || busy) { event.preventDefault(); event.returnValue = ''; } };
  window.addEventListener('beforeunload', beforeUnload);
  function dispose() { disposed = true; dialog.close(); dialog.remove(); window.removeEventListener('beforeunload', beforeUnload); }
  form.addEventListener('input', () => { dirty = true; }); form.addEventListener('change', () => { dirty = true; });
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return; busy = true; message.textContent = 'Saving…';
    const currentValues = values(); const file = controls.get('upload')?.files?.[0];
    // Preserve category-dependent disabled states when a failed request restores the form.
    const interactive = [...form.querySelectorAll('input,textarea,select,button')];
    const disabledBeforeSave = new Map(interactive.map(node => [node, node.disabled]));
    interactive.forEach(node => { node.disabled = true; });
    try {
      const result = await onSave(currentValues, file);
      if (disposed) return;
      dirty = false; busy = false; dispose(); await afterSave?.(result);
    } catch (error) {
      if (disposed) return;
      message.textContent = error.message || 'Save failed. Check your connection before retrying.';
      message.setAttribute('role', 'alert');
      // Keep a successfully uploaded file's link in the form after an uncertain record save.
      if (error.retainedUpload) {
        const link = [...controls.entries()].find(([key]) => /(?:^|_)(file|image|photo|cover|logo)_url$/.test(key));
        if (link) link[1].value = error.retainedUpload.url;
        if (controls.has('upload')) controls.get('upload').value = '';
      }
    } finally { busy = false; if (!disposed) interactive.forEach(node => { node.disabled = disabledBeforeSave.get(node); }); }
  });
  // Specialized screens may connect dependent controls after the safe shared form exists.
  onMount?.({ dialog, form, controls });
  dialog.showModal();
  dispose.canLeave = () => disposed || canLeave();
  return dispose;
}
