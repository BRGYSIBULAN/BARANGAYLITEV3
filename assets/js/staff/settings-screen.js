/**
 * Purpose: edit existing identity/contact/maintenance settings and manage five cover photos.
 * Depends on: settings, covers and Storage services; native forms and image compression.
 * Debug: settings errors keep the draft open; cover conflicts require reloading the baseline.
 */
import { element as el } from '../core/dom.js?v=96b812c63105';
import { heading, button, editorDialog, confirmationDialog, labelFor } from './ui.js?v=96b812c63105';
import { optimizeImage } from '../media/images.js?v=96b812c63105';
import { formatBytes } from '../data/usage.js?v=96b812c63105';
import { MAINTENANCE_DEFAULTS } from '../data/maintenance.js?v=96b812c63105';
import { maintenanceSurface } from '../public/availability.js?v=96b812c63105';

const GROUPS = [
  { title: 'Barangay identity', keys: ['barangay_name', 'municipality_city', 'province', 'logo_url'] },
  { title: 'Public homepage', keys: ['hero_title', 'hero_text'] },
  { title: 'Contact & location', keys: ['address', 'contact_number', 'email', 'facebook_url', 'map_embed_url'] },
];
/** Settings require the exact protected permission, reuse the singleton, and patch only edited fields. */
export function mountSettings(root, services, isCurrent) {
  let disposed = false, dialog, busy = false, loadSequence = 0;
  const active = () => !disposed && isCurrent();
  const reload = button('Reload settings', () => load());
  heading(root, 'Page settings', 'Edit the real public homepage, barangay identity, and contact details. Maintenance controls are separate from notice editing.', [reload, el('a', 'View public website ↗', { href: '../index.html', target: '_blank', rel: 'noopener', class: 'button' })]);
  const availability = el('div'); const slot = el('div', '', { class: 'dashboard-grid' });
  const message = el('p', 'Loading saved settings…', { role: 'status', 'aria-live': 'polite', class: 'module-message' }); root.append(message, availability, slot);
  function controlsDisabled(value) { root.querySelectorAll('button').forEach(control => { control.disabled = value; }); }
  function editGroup(group, settings) {
    const fields = group.keys.map(key => ({ key, type: key.endsWith('_url') ? 'url' : key === 'email' ? 'email' : ['hero_text', 'address', 'maintenance_message'].includes(key) ? 'textarea' : 'text', wide: true, required: ['barangay_name', 'hero_title'].includes(key), max: key === 'maintenance_title' ? 100 : key === 'maintenance_message' ? 500 : 20000 }));
    if (group.keys.includes('logo_url')) fields.push({ key: 'upload', label: 'Upload logo (optional)', type: 'file', accept: 'image/jpeg,image/png,image/webp', wide: true });
    dialog = editorDialog({ title: group.title, fields, original: settings,
      description: group.title === 'Maintenance notice' ? 'Blank notice fields use the default message. Saving this text does not enable or disable maintenance.' : '',
      async onSave(values, file) {
        // Existing notice columns may be NOT NULL; blank copy means the shared fallback.
        for (const key of ['maintenance_title', 'maintenance_message']) if (Object.hasOwn(values, key) && !values[key]) values[key] = MAINTENANCE_DEFAULTS[key];
        let uploaded;
        if (file) { uploaded = await services.storage.upload('branding-media', await optimizeImage(file, { maxSide: 512, target: 120 * 1024 }), { permission: 'page_settings' }); values.logo_url = uploaded.url; }
        const changed = Object.fromEntries(Object.entries(values).filter(([key, value]) => value !== (settings[key] ?? null)));
        if (!Object.keys(changed).length) return settings;
        try { return await services.settings.update(changed); } catch (error) { if (uploaded) { error.retainedUpload = uploaded; error.message += ' Logo retained; copy its URL before retrying.'; } throw error; }
      }, afterSave: async () => { if (active()) { message.textContent = 'Settings saved.'; await load(); } },
    });
  }
  function drawMaintenance(settings) {
    const enabled = settings.maintenance_mode === true;
    const panel = el('section', '', { class: 'dashboard-panel maintenance-control', 'aria-label': 'Maintenance mode controls' });
    panel.append(el('span', enabled ? 'ON · Public website paused' : 'OFF · Public website live', { class: `status-badge ${enabled ? 'warning' : 'good'}` }), el('h2', 'Maintenance mode'),
      el('p', 'When enabled, all public website pages and ID verification show the maintenance notice. The Admin Portal and authenticated dashboards remain accessible.'),
      el('p', 'Already-open public pages recheck on focus, navigation, and at least once per minute while visible.', { class: 'muted compact' }));
    const actions = el('div', '', { class: 'cluster' });
    actions.append(button(enabled ? 'Disable maintenance mode' : 'Enable maintenance mode', async () => {
      if (busy || !active()) return;
      const next = !enabled;
      const confirmed = await confirmationDialog({
        title: next ? 'Enable maintenance mode?' : 'Reopen the public website?',
        description: next ? 'Public pages and ID verification will be paused. Staff access stays available.' : 'Maintenance mode will be disabled and all public pages will become available again.',
        confirmLabel: next ? 'Enable maintenance' : 'Reopen website',
        destructive: next,
      });
      if (!confirmed || !active()) return;
      // A toggle patches only the boolean; empty notice text can never prevent switching OFF.
      busy = true; controlsDisabled(true); message.textContent = next ? 'Enabling maintenance…' : 'Reopening the public website…';
      try {
        const saved = await services.settings.update({ maintenance_mode: next });
        if (!saved || saved.maintenance_mode !== next) throw new Error('Maintenance change was not confirmed. Reload settings before retrying.');
        if (active()) { message.textContent = next ? 'Maintenance enabled. Staff access remains available.' : 'Maintenance disabled. The public website is live.'; await load(); }
      } catch (error) { if (active()) message.textContent = 'Not confirmed: ' + error.message; }
      finally { busy = false; if (active()) controlsDisabled(false); }
    }, true), button('Edit maintenance notice', () => editGroup({ title: 'Maintenance notice', keys: ['maintenance_title', 'maintenance_message'] }, settings)), button('Preview maintenance notice', () => {
      const preview = el('dialog', '', { class: 'edit-dialog', 'aria-label': 'Maintenance notice preview' });
      const close = () => { preview.close(); preview.remove(); };
      preview.append(maintenanceSurface({ ...MAINTENANCE_DEFAULTS, ...settings }, { preview: true, mainId: 'maintenance-preview' }), button('Close preview', close));
      preview.addEventListener('cancel', event => { event.preventDefault(); close(); }); document.body.append(preview); preview.showModal(); dialog = close;
    })); panel.append(actions); availability.replaceChildren(panel);
  }
  async function load() {
    const request = ++loadSequence; controlsDisabled(true);
    try {
      const settings = await services.settings.read(); if (!active() || request !== loadSequence) return;
      if (!settings || typeof settings.maintenance_mode !== 'boolean') throw new Error('Saved settings are unavailable. Please reload.');
      drawMaintenance(settings); slot.replaceChildren();
      if (message.textContent === 'Loading saved settings…') message.textContent = 'Live settings loaded. Use an Edit button below to make changes.';
      GROUPS.forEach(group => {
        const card = el('section', '', { class: 'dashboard-panel' }); card.append(el('h3', group.title));
        group.keys.forEach(key => { const row = el('div', '', { class: 'setting-row' }); row.append(el('small', labelFor(key)), el('p', typeof settings[key] === 'boolean' ? (settings[key] ? 'Enabled' : 'Disabled') : settings[key] || 'Not set')); card.append(row); });
        card.append(button('Edit ' + group.title.toLowerCase(), () => editGroup(group, settings))); slot.append(card);
      });
    } catch (error) { if (active() && request === loadSequence) message.textContent = error.message; }
    finally { if (active() && request === loadSequence && !busy) controlsDisabled(false); }
  }
  load(); const cleanup = () => { disposed = true; loadSequence++; dialog?.(); }; cleanup.canLeave = () => !busy && (!dialog?.canLeave || dialog.canLeave()); return cleanup;
}

/** Upload/save is explicit. Reorder and descriptions remain local until Publish covers. */
export function mountCovers(root, services, isCurrent) {
  let baseline, slides = [], disposed = false, dirty = false, busy = false;
  const temporary = new Set(); const message = el('p', '', { role: 'status', class: 'module-message' }); const list = el('div', '', { class: 'cover-grid' });
  const publish = button('Publish cover photos', save, true); const reload = button('Reload saved photos', async () => {
    if (!dirty || await confirmationDialog({ title: 'Discard cover changes?', description: 'Your selected photos, order, descriptions, and captions will return to the last published version.', confirmLabel: 'Discard changes', destructive: true })) load();
  });
  heading(root, 'Homepage cover photos', 'Up to five compressed images. Reorder them here; the public hero changes automatically every five seconds and also advances when clicked.', [reload, publish]);
  const add = el('input', '', { id: 'cover-upload', type: 'file', accept: 'image/jpeg,image/png,image/webp,image/gif', multiple: '' }); const addLabel = el('label', '+ Select cover photos', { for: 'cover-upload' });
  const uploader = el('div', '', { class: 'upload-zone' }); uploader.append(addLabel, add, el('small', 'Maximum 5 photos. Up to 15 MB input each; automatically resized before upload. GIFs become still covers.')); root.append(uploader, message, list);
  const beforeUnload = event => { if (dirty || busy) { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', beforeUnload);
  function setBusy(value) { busy = value; root.querySelectorAll('button,input,textarea').forEach(input => { input.disabled = value; }); }
  function draw() {
    list.replaceChildren(); publish.disabled = busy || !dirty || !baseline; add.disabled = busy || slides.length >= 5 || !baseline;
    slides.forEach((slide, i) => {
      const card = el('article', '', { class: 'cover-card' }); card.append(el('img', '', { src: slide.preview || slide.url, alt: slide.alt, width: 600, height: 338 }), el('strong', `Cover ${i + 1}`));
      const alt = el('input', '', { value: slide.alt, maxlength: 180, 'aria-label': `Photo description ${i + 1}`, placeholder: 'Describe this photo (required)' });
      const caption = el('input', '', { value: slide.caption || '', maxlength: 300, 'aria-label': `Caption ${i + 1}`, placeholder: 'Optional caption' });
      alt.addEventListener('input', () => { slide.alt = alt.value; dirty = true; publish.disabled = false; }); caption.addEventListener('input', () => { slide.caption = caption.value; dirty = true; publish.disabled = false; });
      const controls = el('div', '', { class: 'cluster' });
      const move = direction => { [slides[i], slides[i + direction]] = [slides[i + direction], slides[i]]; dirty = true; draw(); };
      const up = button('← Earlier', () => move(-1)); up.disabled = i === 0;
      const down = button('Later →', () => move(1)); down.disabled = i === slides.length - 1;
      controls.append(up, down, button('Remove', () => { slides.splice(i, 1); dirty = true; draw(); }));
      card.append(el('label', 'Photo description'), alt, el('label', 'Caption'), caption, controls); if (slide.file) card.append(el('small', `${formatBytes(slide.file.size)} selected · not yet uploaded`)); list.append(card);
      if (slide.url) card.append(el('a', 'Stored photo link ↗', { href: slide.url, target: '_blank', rel: 'noopener noreferrer', class: 'compact' }));
    });
    if (!slides.length) list.append(el('p', 'No cover photos yet. Your existing homepage remains visible.', { class: 'empty' }));
  }
  add.addEventListener('change', () => {
    const files = [...add.files]; add.value = '';
    if (files.length + slides.length > 5) { message.textContent = 'Only five cover photos are allowed. Remove one or choose fewer files.'; return; }
    for (const file of files) { const preview = URL.createObjectURL(file); temporary.add(preview); slides.push({ id: crypto.randomUUID(), file, preview, alt: '', caption: '' }); }
    dirty = true; message.textContent = 'Add a description to each photo, then publish.'; draw();
  });
  async function load() {
    setBusy(true);
    try { const result = await services.covers.read(); if (disposed || !isCurrent()) return; baseline = result; slides = result.slides.map(slide => ({ ...slide })); dirty = false; temporary.forEach(url => URL.revokeObjectURL(url)); temporary.clear(); message.textContent = 'Saved cover photos loaded.'; }
    catch (error) { if (!disposed) message.textContent = error.message; }
    finally { setBusy(false); if (!disposed) draw(); }
  }
  async function save() {
    if (busy || !baseline) return;
    if (slides.some(slide => !slide.alt.trim())) { message.textContent = 'Please add a photo description to every cover.'; return; }
    const confirmed = await confirmationDialog({
      title: 'Publish homepage covers?',
      description: `${slides.length} cover photo${slides.length === 1 ? '' : 's'} will replace the currently published slideshow order.`,
      confirmLabel: 'Publish covers',
    });
    if (!confirmed || disposed || !isCurrent()) return;
    setBusy(true); message.textContent = 'Compressing and saving cover photos…';
    try {
      for (const slide of slides) if (slide.file) { const image = await optimizeImage(slide.file); const uploaded = await services.storage.upload('branding-media', image, { permission: 'covers' }); slide.url = uploaded.url; delete slide.file; }
      const saved = await services.covers.save(slides, baseline); if (disposed || !isCurrent()) return;
      baseline = saved; slides = saved.slides; dirty = false; message.textContent = 'Cover photos published. Previous files were retained because they may still be linked elsewhere.';
      temporary.forEach(url => URL.revokeObjectURL(url)); temporary.clear();
    } catch (error) { if (!disposed) message.textContent = error.message + ' Already uploaded photos are retained. Copy their links before discarding this draft.'; }
    finally { setBusy(false); if (!disposed) draw(); }
  }
  load(); const cleanup = () => { disposed = true; temporary.forEach(url => URL.revokeObjectURL(url)); window.removeEventListener('beforeunload', beforeUnload); };
  cleanup.canLeave = () => !busy && (!dirty || confirm('Discard unsaved cover changes?')); return cleanup;
}
