/**
 * Purpose: manage Content Admin accounts and applications with in-page confirmation dialogs.
 * Depends on: manage-editors service and server-side authorization; no Auth admin keys.
 * Debug: function errors appear in the screen; System Admin accounts are never offered as targets.
 */
import { element as el } from '../core/dom.js?v=96b812c63105';
import { heading, button, badge, recordTable, dateText } from './ui.js?v=96b812c63105';
import { PUBLIC_SITE } from '../data/id-model.js?v=96b812c63105';
import { DELEGATED_MODULES, permissionEnabled } from '../data/permissions.js?v=96b812c63105';

export function mountAccounts(root, services, isCurrent) {
  let disposed = false, dialog = null, busy = false;
  const status = el('p', '', { role: 'status', class: 'module-message' });
  const slot = el('div', '', { class: 'stack' });
  const redirectTo = new URL('activate.html', PUBLIC_SITE).href;

  // Standalone invitations were intentionally removed. New Content Admins must apply first,
  // then the System Admin can approve the application from the list below.
  heading(root, 'Content Admin accounts', 'Review access requests and grant selected System Admin modules to each Content Admin individually. Your System Admin account is unchanged.');
  root.append(status, slot);

  function closeDialog() {
    if (!dialog) return;
    dialog.close();
    dialog.remove();
    dialog = null;
  }

  function confirmAction({ title, description, confirmLabel = 'Confirm', requireEmail = '', operation, success = 'Account action completed.' }) {
    if (busy || dialog) return;
    const modal = el('dialog', '', { class: 'edit-dialog', 'aria-label': title });
    const form = el('form', '', { class: 'editor-form' });
    const message = el('p', '', { role: 'status', 'aria-live': 'polite', class: 'form-message' });
    const actions = el('div', '', { class: 'form-actions field-wide' });
    const cancel = button('Cancel', () => closeDialog());
    const submit = el('button', confirmLabel, { type: 'submit', class: 'primary' });
    let emailInput = null;

    modal.append(el('div', '', { class: 'dialog-heading' }));
    modal.querySelector('.dialog-heading').append(el('h2', title));
    if (description) modal.append(el('p', description, { class: 'muted' }));

    if (requireEmail) {
      const field = el('div', '', { class: 'field field-wide' });
      const id = 'confirm-admin-email';
      emailInput = el('input', '', { id, name: 'confirmation', type: 'email', autocomplete: 'off', required: true });
      field.append(
        el('label', `Type ${requireEmail} to confirm`, { for: id }),
        emailInput,
        el('small', 'This permanently removes the selected Content Admin account from Supabase Auth and its editor profile.')
      );
      form.append(field);
    }

    actions.append(cancel, submit);
    form.append(message, actions);
    modal.append(form);
    document.body.append(modal);
    dialog = modal;

    modal.addEventListener('cancel', event => {
      event.preventDefault();
      if (!busy) closeDialog();
    });

    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (busy) return;
      const typed = emailInput?.value?.trim() || '';
      if (requireEmail && typed.toLowerCase() !== requireEmail.trim().toLowerCase()) {
        message.textContent = 'Email confirmation did not match.';
        message.setAttribute('role', 'alert');
        return;
      }
      busy = true;
      form.querySelectorAll('input,button').forEach(node => { node.disabled = true; });
      message.textContent = 'Processing…';
      try {
        await operation(typed);
        if (disposed || !isCurrent()) return;
        closeDialog();
        status.textContent = success;
        await load();
      } catch (error) {
        if (!disposed && isCurrent()) {
          message.textContent = error.message || 'Unable to complete this action.';
          message.setAttribute('role', 'alert');
        }
      } finally {
        busy = false;
        if (dialog) form.querySelectorAll('input,button').forEach(node => { node.disabled = false; });
      }
    });

    modal.showModal();
    emailInput?.focus();
  }

  /** Every delegated module has its own Save button so one change cannot overwrite another. */
  function manageModuleAccess(account, savedRows) {
    if (busy || dialog) return;
    const accountId = account.user_id || account.id;
    const modal = el('dialog', '', { class: 'edit-dialog permission-dialog', 'aria-label': `Module access for ${account.display_name || account.email}` });
    const message = el('p', '', { role: 'status', 'aria-live': 'polite', class: 'form-message' });
    const list = el('div', '', { class: 'permission-grid' });
    const close = button('Close', () => { if (!busy) closeDialog(); }, true);
    modal.append(el('div', '', { class: 'dialog-heading' }));
    modal.querySelector('.dialog-heading').append(el('h2', account.display_name || account.email));
    modal.append(el('p', 'Enable only the protected modules this Content Admin needs. Expired access turns off automatically; database RLS and RPC checks enforce every action.', { class: 'muted' }), message, list);

    DELEGATED_MODULES.forEach(def => {
      let saved = savedRows.find(row => row.permission_key === def.key) || null;
      const card = el('section', '', { class: 'permission-card' });
      const title = el('div'); title.append(el('h3', def.label), el('p', def.description, { class: 'muted compact' }));
      const toggleLabel = el('label', '', { class: 'visibility-switch', title: `Enable ${def.label}` });
      const toggle = el('input', '', { type: 'checkbox', 'aria-label': `Enable ${def.label}` });
      toggle.checked = permissionEnabled(saved);
      toggleLabel.append(toggle, el('span', '', { 'aria-hidden': 'true' }));
      const top = el('div', '', { class: 'permission-card-top' }); top.append(title, toggleLabel);
      const expiryField = el('div', '', { class: 'field' });
      const expiryId = `permission-${accountId}-${def.key}`;
      const expiry = el('select', '', { id: expiryId, 'aria-label': `${def.label} access duration` });
      [['1', '24 hours'], ['7', '7 days'], ['30', '30 days'], ['none', 'No expiry']].forEach(([value, label]) => expiry.append(el('option', label, { value })));
      if (saved?.is_enabled && !saved.expires_at) expiry.value = 'none';
      else if (saved?.expires_at) {
        const days = Math.max(1, Math.ceil((new Date(saved.expires_at) - new Date()) / 86400000));
        expiry.value = days <= 1 ? '1' : days <= 7 ? '7' : '30';
      } else expiry.value = '7';
      expiry.disabled = !toggle.checked;
      toggle.addEventListener('change', () => { expiry.disabled = !toggle.checked; });
      expiryField.append(el('label', 'Access duration', { for: expiryId }), expiry);
      const state = el('span', toggle.checked ? (saved?.expires_at ? `On until ${dateText(saved.expires_at)}` : 'On · no expiry') : 'Off', { class: `status-badge ${toggle.checked ? 'good' : ''}` });
      const save = button('Save this module', async () => {
        if (busy) return;
        busy = true; save.disabled = toggle.disabled = expiry.disabled = true; message.textContent = `Saving ${def.label}…`;
        try {
          const expiresAt = toggle.checked && expiry.value !== 'none' ? new Date(Date.now() + Number(expiry.value) * 86400000).toISOString() : null;
          saved = await services.permissions.save(accountId, def.key, toggle.checked, expiresAt);
          state.textContent = permissionEnabled(saved) ? (saved.expires_at ? `On until ${dateText(saved.expires_at)}` : 'On · no expiry') : 'Off';
          state.className = `status-badge ${permissionEnabled(saved) ? 'good' : ''}`;
          message.textContent = `${def.label} access saved for ${account.display_name || account.email}.`;
        } catch (error) { message.textContent = error.message; message.setAttribute('role', 'alert'); }
        finally { busy = false; save.disabled = toggle.disabled = false; expiry.disabled = !toggle.checked; }
      }, true);
      const actions = el('div', '', { class: 'permission-card-actions' }); actions.append(expiryField, state, save);
      card.append(top, actions); list.append(card);
    });
    const actions = el('div', '', { class: 'form-actions' }); actions.append(close); modal.append(actions);
    modal.addEventListener('cancel', event => { event.preventDefault(); if (!busy) closeDialog(); });
    document.body.append(modal); dialog = modal; modal.showModal();
  }

  async function load() {
    try {
      const [data, permissions] = await Promise.all([services.editors.list(), services.permissions.list()]);
      if (disposed || !isCurrent()) return;
      slot.replaceChildren();

      const accounts = (data.content_admins || data.editors || []).filter(row => row.role !== 'admin');
      slot.append(
        el('h3', 'Current Content Admins'),
        recordTable(accounts, [
          { key: 'display_name', label: 'Name' },
          { key: 'email' },
          { key: 'is_active', label: 'Access', render: row => badge(row.is_active ? 'Active' : 'Disabled', row.is_active ? 'good' : 'warning') },
        ], row => [
          button('Module access', () => manageModuleAccess(row, permissions.filter(grant => grant.target_user_id === (row.user_id || row.id)))),
          button(row.is_active ? 'Disable' : 'Enable', () => confirmAction({
            title: row.is_active ? 'Disable Content Admin' : 'Enable Content Admin',
            description: `${row.is_active ? 'Disable' : 'Enable'} access for ${row.email}?`,
            confirmLabel: row.is_active ? 'Disable' : 'Enable',
            operation: () => services.editors.setActive(row.user_id || row.id, !row.is_active),
          })),
          button('Delete', () => confirmAction({
            title: 'Delete Content Admin',
            description: `Permanently delete ${row.email}. This cannot be undone.`,
            confirmLabel: 'Delete account',
            requireEmail: row.email,
            operation: typed => services.editors.remove(row.user_id || row.id, row.email, typed),
            success: 'Content Admin deleted.',
          })),
        ])
      );

      slot.append(
        el('h3', 'Applications'),
        recordTable(data.applications || [], [
          { key: 'display_name', label: 'Name' },
          { key: 'email' },
          { key: 'status', render: row => badge(row.status) },
          { key: 'submitted_at', render: row => dateText(row.submitted_at || row.created_at) },
        ], row => {
          const actions = [];
          if (row.status === 'pending') {
            actions.push(
              button('Approve & invite', () => confirmAction({
                title: 'Approve Content Admin application',
                description: `Approve ${row.email} and send the activation invitation?`,
                confirmLabel: 'Approve & invite',
                operation: () => services.editors.approve(row.id, redirectTo),
                success: 'Application approved.',
              })),
              button('Reject', () => confirmAction({
                title: 'Reject application',
                description: `Reject the application from ${row.email}?`,
                confirmLabel: 'Reject',
                operation: () => services.editors.reject(row.id),
                success: 'Application rejected.',
              }))
            );
          }
          actions.push(button('Delete', () => confirmAction({
            title: 'Delete application record',
            description: `Delete the application record for ${row.email}? This removes only this application record.`,
            confirmLabel: 'Delete record',
            operation: () => services.editors.deleteApplication(row.id),
            success: 'Application record deleted.',
          })));
          return actions;
        })
      );
    } catch (error) {
      if (!disposed && isCurrent()) status.textContent = error.message;
    }
  }

  load();
  const cleanup = () => {
    disposed = true;
    if (!busy) closeDialog();
  };
  cleanup.canLeave = () => !busy;
  return cleanup;
}
