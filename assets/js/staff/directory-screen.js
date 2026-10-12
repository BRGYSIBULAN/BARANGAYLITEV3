/**
 * Purpose: assign existing database people to Officials, Staff, or Functionaries without retyping identity data.
 * Depends on: directory RPC service, existing gallery-media uploads, shared dialogs, and image optimization.
 * Debug: verify the list view/section, then the saved subcategory and explicit public switch.
 */
import { DIRECTORY_SECTIONS, DIRECTORY_SUBCATEGORIES } from '../data/contracts.js?v=96b812c63105';
import { element as el } from '../core/dom.js?v=96b812c63105';
import { badge, button, confirmationDialog, detailsDialog, editorDialog, heading, recordTable } from './ui.js?v=96b812c63105';

const SCREENS = Object.freeze({
  officials: Object.freeze({ section: 'officials', label: 'Barangay Officials' }),
  'directory-staff': Object.freeze({ section: 'staff', label: 'Barangay Staff' }),
  'directory-functionaries': Object.freeze({ section: 'functionaries', label: 'Barangay Functionaries' }),
});

export const DIRECTORY_ROUTE_KEYS = Object.freeze(Object.keys(SCREENS));

export function directoryScreen(route) {
  const screen = SCREENS[route];
  if (!screen) throw new Error('Unsupported Directory screen.');
  return screen;
}

/** Officials need no subcategory; their designation determines the public hierarchy. */
export function officialOrder(designation = '') {
  const value = designation.toLowerCase();
  if (/punong|barangay captain|barangay chair/.test(value)) return 10;
  if (/sk chair/.test(value)) return 60;
  if (/sk kagawad|sk council/.test(value)) return 70;
  if (/sk secretary/.test(value)) return 80;
  if (/sk treasurer/.test(value)) return 90;
  if (/kagawad|councilor/.test(value)) return 20;
  if (/ipmr|indigenous peoples mandatory representative/.test(value)) return 30;
  if (/secretary/.test(value)) return 40;
  if (/treasurer/.test(value)) return 50;
  return 100;
}

function editorFields() {
  return [
    { key: 'directory_section', label: 'Directory category', required: true, options: [
      { value: '', label: 'Not included in public Directory' },
      ...Object.entries(DIRECTORY_SECTIONS).map(([value, label]) => ({ value, label })),
    ], help: 'The name and designation remain connected to this existing database person.' },
    { key: 'directory_subcategory', label: 'Subcategory / group heading', suggestions: [...DIRECTORY_SUBCATEGORIES.staff, ...DIRECTORY_SUBCATEGORIES.functionaries], help: 'Required for Staff and Functionaries. You may type an exact local group heading.' },
    { key: 'directory_photo_url', label: 'Directory photo link', type: 'url', wide: true, help: 'Use an existing HTTPS image, upload a photo below, or leave blank for the neutral profile icon.' },
    { key: 'directory_sort_order', label: 'Display order', type: 'number', default: 0 },
    { key: 'directory_is_published', label: 'Publish on public website', type: 'checkbox', default: false, wide: true, help: 'The person appears publicly only while this is checked and the existing ID record is ACTIVE.' },
    { key: 'upload', label: 'Upload replacement photo or icon (optional)', type: 'file', wide: true, accept: 'image/jpeg,image/png,image/webp,image/gif', help: 'Images are resized and compressed. The existing name, designation, ID number, and QR token are not changed.' },
  ];
}

/** Keep the subcategory control aligned with the chosen main Directory category. */
function connectCategoryControls({ form, controls }) {
  const section = controls.get('directory_section');
  const subcategory = controls.get('directory_subcategory');
  const published = controls.get('directory_is_published');
  const subcategoryField = subcategory.closest('.field');
  const suggestions = form.querySelector('#field-directory_subcategory-suggestions');
  const apply = () => {
    const value = section.value;
    const needsSubcategory = value === 'staff' || value === 'functionaries';
    subcategoryField.hidden = !needsSubcategory;
    subcategory.required = needsSubcategory;
    const choices = DIRECTORY_SUBCATEGORIES[value] || [];
    suggestions?.replaceChildren(...choices.map(choice => el('option', '', { value: choice })));
    if (!value) { published.checked = false; published.disabled = true; }
    else published.disabled = false;
  };
  section.addEventListener('change', apply);
  apply();
}

/** A focused manager reuses the same 170-person database and never offers a duplicate-person Add action. */
export function mountDirectory(root, route, services, isCurrent) {
  const screen = directoryScreen(route);
  let disposed = false, generation = 0, page = 0, dialog, busy = false;
  let appliedSearch = '', appliedView = 'section';
  const active = () => !disposed && isCurrent();
  const message = el('p', '', { role: 'status', 'aria-live': 'polite', class: 'module-message' });
  const showUnassigned = button('Categorize existing person', () => { view.value = 'unassigned'; appliedView = 'unassigned'; load(0); }, true);
  heading(root, screen.label, 'Names and designations come automatically from the existing ID database. Choose only the Directory category, subcategory, order, photo, and public visibility.', [showUnassigned]);

  const toolbar = el('form', '', { class: 'list-toolbar', role: 'search' });
  const search = el('input', '', { type: 'search', maxlength: 100, placeholder: 'Search existing name or designation…', 'aria-label': 'Search existing name or designation' });
  const view = el('select', '', { 'aria-label': 'Directory assignment view' });
  [
    ['section', `Assigned to ${screen.label}`],
    ['unassigned', 'Not yet categorized'],
    ['all', 'All existing people'],
    ['published', `Published in ${screen.label}`],
    ['hidden', `Hidden in ${screen.label}`],
  ].forEach(([value, label]) => view.append(el('option', label, { value })));
  const clear = button('Clear filters', () => { search.value = ''; view.value = 'section'; appliedSearch = ''; appliedView = 'section'; load(0); });
  toolbar.append(search, view, el('button', 'Search', { type: 'submit' }), clear);
  toolbar.addEventListener('submit', event => { event.preventDefault(); appliedSearch = search.value.trim(); appliedView = view.value; load(0); });
  view.addEventListener('change', () => { appliedView = view.value; load(0); });

  const slot = el('div');
  const footer = el('div', '', { class: 'list-footer' });
  const summary = el('span', 'Loading existing people…');
  const previous = button('← Previous', () => load(page - 1));
  const next = button('Next →', () => load(page + 1));
  footer.append(summary, previous, next);
  root.append(toolbar, message, slot, footer);

  async function savePerson(row, values, file) {
    let photoUrl = values.directory_photo_url;
    let uploaded;
    if (file) {
      const { optimizeImage } = await import('../media/images.js?v=96b812c63105');
      uploaded = await services.storage.upload('gallery-media', await optimizeImage(file));
      photoUrl = uploaded.url;
    }
    try {
      return await services.directory.save({
        id: row.id,
        section: values.directory_section,
        subcategory: values.directory_subcategory,
        photoUrl,
        sortOrder: values.directory_sort_order,
        isPublished: values.directory_is_published,
      });
    } catch (error) {
      if (uploaded) {
        error.message += ' The uploaded image was retained. Check the record before uploading it again.';
        error.retainedUpload = uploaded;
      }
      throw error;
    }
  }

  function openEditor(row) {
    const defaultSection = row.directory_section || screen.section;
    const original = {
      directory_section: defaultSection,
      directory_subcategory: row.directory_subcategory || '',
      directory_photo_url: row.directory_photo_url || '',
      directory_sort_order: Number(row.directory_sort_order) || (defaultSection === 'officials' ? officialOrder(row.designation) : 0),
      directory_is_published: row.directory_is_published === true,
    };
    dialog = editorDialog({
      title: `Directory assignment: ${row.name}`,
      description: `Existing designation: ${row.designation || 'Not recorded'}. Edit the ID record separately if the name or designation itself is incorrect.`,
      fields: editorFields(), original, saveLabel: 'Save Directory assignment', onMount: connectCategoryControls,
      onSave: (values, file) => savePerson(row, values, file),
      afterSave: async saved => {
        if (!active()) return;
        message.textContent = saved.directory_section
          ? `${saved.name} is categorized under ${DIRECTORY_SECTIONS[saved.directory_section]}${saved.directory_subcategory ? ` — ${saved.directory_subcategory}` : ''}.`
          : `${saved.name} was removed from the public Directory without deleting the database person.`;
        await load(page);
      },
    });
  }

  function openDetails(row) {
    dialog = detailsDialog({ title: `View Directory assignment: ${row.name}`, fields: [
      { key: 'name', label: 'Existing name' }, { key: 'designation', label: 'Existing designation' },
      { key: 'directory_section', label: 'Directory category' }, { key: 'directory_subcategory', label: 'Subcategory / group heading' },
      { key: 'directory_sort_order', label: 'Display order' }, { key: 'directory_is_published', label: 'Published switch' },
      { key: 'directory_is_eligible', label: 'Existing ID is ACTIVE' }, { key: 'directory_photo_url', label: 'Directory photo link' },
    ], record: row });
  }

  async function removeAssignment(row, trigger) {
    const confirmed = await confirmationDialog({
      title: 'Remove from public Directory?',
      description: `${row.name} will become uncategorized and hidden from the public Directory. The existing ID record, name, designation, and QR code will not be deleted.`,
      confirmLabel: 'Remove Directory assignment', destructive: true,
    });
    if (!confirmed || !active()) return;
    trigger.disabled = true; message.textContent = 'Removing Directory assignment…';
    try {
      await services.directory.save({ id: row.id, section: null, photoUrl: row.directory_photo_url, sortOrder: row.directory_sort_order, isPublished: false });
      if (active()) { message.textContent = `${row.name} was removed from the Directory. The database person remains stored.`; await load(page); }
    } catch (error) { if (active()) message.textContent = error.message; }
    finally { trigger.disabled = false; }
  }

  function actions(row) {
    const result = [button('View', () => openDetails(row)), button(row.directory_section ? 'Edit category' : 'Categorize', () => openEditor(row), true)];
    if (row.directory_section) result.push(button('Remove from Directory', event => removeAssignment(row, event.currentTarget)));
    return result;
  }

  const columns = [
    { key: 'name', label: 'Existing name' },
    { key: 'designation', label: 'Existing designation' },
    { key: 'directory_section', label: 'Directory category', render: row => row.directory_section ? DIRECTORY_SECTIONS[row.directory_section] : 'Not categorized' },
    { key: 'directory_subcategory', label: 'Subcategory' },
    { key: 'directory_is_eligible', label: 'ID record', render: row => badge(row.directory_is_eligible ? 'ACTIVE' : 'Not active', row.directory_is_eligible ? 'good' : 'warning') },
    { key: 'directory_is_published', label: 'Public', render: row => badge(row.directory_is_published ? (row.directory_is_eligible ? 'Published' : 'Waiting for ACTIVE status') : 'Hidden', row.directory_is_published && row.directory_is_eligible ? 'good' : row.directory_is_published ? 'warning' : '') },
    { key: 'directory_sort_order', label: 'Order' },
  ];

  async function load(target = 0) {
    if (busy || !active()) return;
    const request = ++generation; busy = true; previous.disabled = next.disabled = showUnassigned.disabled = true; summary.textContent = 'Loading…';
    try {
      const options = { section: screen.section, view: appliedView, search: appliedSearch, page: Math.max(0, target), pageSize: 20 };
      const data = await services.directory.listStaff(options);
      if (!active() || request !== generation) return;
      if (!data.rows.length && target > 0) { busy = false; await load(target - 1); return; }
      page = options.page;
      slot.replaceChildren(recordTable(data.rows, columns, actions));
      if (!data.rows.length && appliedView === 'section') message.textContent = `No one is assigned to ${screen.label} yet. Choose “Not yet categorized” or use “Categorize existing person.”`;
      summary.textContent = `${data.count} existing ${data.count === 1 ? 'person' : 'people'} · Page ${page + 1}`;
      previous.disabled = page === 0; next.disabled = (page + 1) * 20 >= data.count;
    } catch (error) {
      if (active() && request === generation) { message.textContent = error.message; summary.textContent = 'Could not load existing people.'; }
    } finally {
      busy = false;
      if (active() && request === generation) showUnassigned.disabled = false;
    }
  }

  load();
  const cleanup = () => { disposed = true; generation++; dialog?.(); };
  cleanup.canLeave = () => !busy && (!dialog?.canLeave || dialog.canLeave());
  return cleanup;
}
