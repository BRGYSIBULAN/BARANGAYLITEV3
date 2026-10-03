/**
 * Purpose: exercise native editing controls and public result rendering without live writes.
 * Depends on: linkedom test DOM and exported presentation helpers, not a browser session.
 * Debug: tests submit a fake form through its normal event handler and inspect service arguments.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { editorDialog, fieldsForm, recordTable, labelFor, confirmationDialog, detailsDialog } from '../assets/js/staff/ui.js';
import { verificationResult } from '../assets/js/public/verify.js';
import { editFields, mountContent } from '../assets/js/staff/content-screen.js';
import { directoryScreen, mountDirectory, officialOrder } from '../assets/js/staff/directory-screen.js';
import { STAFF_CONTENT_ROUTES } from '../assets/js/staff/workspace.js';
import { mountStudio } from '../assets/js/design/studio.js';
import { presetDesign } from '../assets/js/design/model.js';
import { accessSurface, applyAccessCover } from '../assets/js/design/access-renderer.js';
import { contentCard, officialsRoster, publicHome, publicFooter, publicHeader } from '../assets/js/design/public-renderer.js';
import { CAROUSEL_INTERVAL_MS } from '../assets/js/public/carousel.js';
import { installPhotoViewer } from '../assets/js/public/photo-viewer.js';
import { showRecords } from '../assets/js/core/dom.js';
const { window } = parseHTML('<!doctype html><html><body></body></html>');
globalThis.window = window; globalThis.document = window.document; globalThis.Node = window.Node;
globalThis.confirm = () => true;

test('ID quick filters reset status, retain search, and Clear filters resets validity', async () => {
  const root = document.createElement('main'); document.body.append(root);
  const calls = [];
  const cleanup = mountContent(root, 'verification', { verification: { list: async options => { calls.push(options); return { rows: [], count: 0 }; } } }, () => true);
  try {
    root.querySelector('input[type=search]').value = 'Example';
    const expiring = [...root.querySelectorAll('button')].find(button => button.textContent === 'Expiring within 30 days');
    expiring.click();
    assert.equal(calls.at(-1).validity, 'expiring');
    assert.equal(calls.at(-1).search, 'Example');
    assert.equal(calls.at(-1).status, 'all');
    assert.equal(expiring.getAttribute('aria-pressed'), 'true');
    const filter = root.querySelector('select'); filter.value = 'INACTIVE'; filter.dispatchEvent(new window.Event('change'));
    assert.equal(calls.at(-1).validity, 'all');
    assert.equal(calls.at(-1).status, 'INACTIVE');
    expiring.click();
    [...root.querySelectorAll('button')].find(button => button.textContent === 'Clear filters').click();
    assert.equal(calls.at(-1).validity, 'all');
    assert.equal(calls.at(-1).search, '');
  } finally { cleanup(); root.remove(); }
});

test('ID namesake confirmation cancels safely and only overrides after explicit confirmation', async () => {
  const root = document.createElement('main'); document.body.append(root);
  const saves = [];
  const cleanup = mountContent(root, 'verification', { verification: {
    list: async () => ({ rows: [], count: 0 }),
    save: async (values, id, options) => {
      saves.push({ values, options });
      if (!options?.allowSameName) { const error = new Error('Matching full name: TEST-OLD'); error.code = 'DUPLICATE_ID_NAME'; throw error; }
      return { id: 2 };
    },
  } }, () => true);
  const tick = () => new Promise(resolve => setImmediate(resolve));
  try {
    [...root.querySelectorAll('button')].find(button => button.textContent === '+ Add ID record').click();
    const form = document.querySelector('.editor-form');
    form.querySelector('[name=control_number]').value = 'TEST-NEW';
    form.querySelector('[name=first_name]').value = 'Example';
    form.querySelector('[name=last_name]').value = 'Resident';
    form.dispatchEvent(new window.Event('submit', { cancelable: true })); await tick();
    [...document.querySelectorAll('.confirm-dialog button')].find(button => button.textContent === 'Cancel').click(); await tick();
    assert.equal(saves.length, 1);
    assert.equal(form.querySelector('[name=control_number]').value, 'TEST-NEW');
    assert.match(form.textContent, /Not saved/);
    form.dispatchEvent(new window.Event('submit', { cancelable: true })); await tick();
    [...document.querySelectorAll('.confirm-dialog button')].find(button => button.textContent === 'Save as a different person').click(); await tick();
    assert.equal(saves.length, 3);
    assert.equal(saves.at(-1).options.allowSameName, true);
    assert.equal(document.querySelector('.editor-form'), null);
  } finally { cleanup(); root.remove(); }
});
globalThis.matchMedia = () => ({ matches: true });
window.HTMLElement.prototype.showModal = function () { this.setAttribute('open', ''); };
window.HTMLElement.prototype.close = function () { this.removeAttribute('open'); };
// Linkedom omits the native select.value setter; emulate option selection for unit tests.
Object.defineProperty(window.HTMLSelectElement.prototype, 'value', {
  configurable: true,
  get() { return this.querySelector('option[selected]')?.value || ''; },
  set(value) { for (const option of this.options) option.toggleAttribute('selected', option.value === value); },
});

test('editor dialog submits typed values and closes only after successful save', async () => {
  let payload;
  const cleanup = editorDialog({ title: 'Service', fields: [{ key: 'name', required: true }, { key: 'sort_order', type: 'number', default: 0 }, { key: 'is_active', type: 'checkbox' }], original: { name: 'Existing service', is_active: false }, onSave: async values => { payload = values; } });
  document.querySelector('[name=name]').value = 'Updated service';
  document.querySelector('[name=is_active]').checked = true;
  document.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(payload, { name: 'Updated service', sort_order: 0, is_active: true }); assert.equal(document.querySelector('dialog'), null); cleanup();
});
test('failed saves preserve form values and display the error', async () => {
  const cleanup = editorDialog({ title: 'Service', fields: [{ key: 'name' }], original: { name: 'Keep my draft' }, onSave: async () => { throw new Error('Access denied'); } });
  document.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); await new Promise(resolve => setImmediate(resolve));
  assert.equal(document.querySelector('[name=name]').value, 'Keep my draft'); assert.match(document.querySelector('dialog').textContent, /Access denied/); cleanup();
});
test('public verification result exposes no private extra fields and cannot inject HTML', () => {
  const result = verificationResult({ control_number: 'TEST-001', full_name: '<script>bad</script>', status: 'ACTIVE', date_acquired: '2025-01-01', expiration_date: '2099-01-01', private_note: 'never render' });
  assert.equal(result.querySelector('script'), null); assert.match(result.textContent, /<script>bad<\/script>/); assert.doesNotMatch(result.textContent, /never render/);
});
test('tables display safe content and empty states', () => {
  assert.match(recordTable([], [], () => []).textContent, /No matching/);
  const table = recordTable([{ title: '<img src=x onerror=bad>' }], [{ key: 'title' }], () => []);
  assert.equal(table.querySelector('img'), null);
  assert.equal(table.querySelector('td').getAttribute('data-label'), 'Title');
});
test('public navigation exposes the approved hierarchy and Admin Portal choices', () => {
  const header = publicHeader({ barangay_name: 'Sibulan' }, 'functionaries');
  const mainLabels = [...header.querySelector('.public-nav .container').children].map(node => node.tagName === 'A' ? node.textContent : node.querySelector('summary').textContent);
  assert.deepEqual(mainLabels, ['Home', 'News & Updates', 'Services', 'About', 'Directory', 'Admin Portal']);
  assert.match(header.textContent, /Verify Barangay IDRequest AppointmentDownloadable Forms/);
  assert.match(header.textContent, /Barangay OfficialsBarangay StaffBarangay Functionaries/);
  assert.match(header.textContent, /System Admin LoginContent Admin Login/);
  assert.equal(header.textContent.includes('Staff portal'), false);
  assert.equal(header.querySelector('summary[aria-current=page]').textContent, 'Directory');
});
test('directory CRUD suggests known headings but accepts the barangay exact category text', () => {
  const fields = editFields('directory_entries');
  const category = fields.find(field => field.key === 'category');
  const upload = fields.find(field => field.key === 'upload');
  assert.equal(category.options, undefined);
  assert.ok(category.suggestions.includes('BHW'));
  const { form } = fieldsForm([category], {});
  form.querySelector('[name=category]').value = 'Exact Local Designation';
  assert.equal(form.querySelector('[name=category]').value, 'Exact Local Designation');
  assert.match(upload.label, /photo or icon/i);
});
test('admin Directory has focused Officials, Staff, and Functionaries managers', () => {
  const directory = STAFF_CONTENT_ROUTES.filter(route => route.parent === 'directory');
  assert.deepEqual(directory.map(route => route.label), ['Barangay Officials', 'Barangay Staff', 'Barangay Functionaries']);
  assert.equal(STAFF_CONTENT_ROUTES.some(route => route.key === 'directory_entries'), false);
  assert.equal(directoryScreen('officials').section, 'officials');
  assert.equal(directoryScreen('directory-staff').section, 'staff');
  assert.equal(directoryScreen('directory-functionaries').section, 'functionaries');
  assert.equal(officialOrder('Punong Barangay'), 10);
  assert.equal(officialOrder('SK Treasurer'), 90);
});
test('Barangay Staff manager categorizes an existing database person without creating a duplicate', async () => {
  const root = document.createElement('main'); document.body.append(root);
  let firstList, saved, calls = 0;
  const person = { id: 17, name: 'Existing Staff', designation: 'Barangay Clerk', directory_section: null, directory_subcategory: null, directory_sort_order: 0, directory_is_published: false, directory_is_eligible: true };
  const services = {
    directory: {
      listStaff: async options => { calls++; firstList ||= options; return options.view === 'unassigned' ? { rows: [person], count: 1 } : { rows: [], count: 0 }; },
      save: async values => { saved = values; return { ...person, directory_section: values.section, directory_subcategory: values.subcategory, directory_sort_order: values.sortOrder, directory_is_published: values.isPublished }; },
    },
    storage: { upload: async () => { throw new Error('No upload expected'); } },
  };
  const cleanup = mountDirectory(root, 'directory-staff', services, () => true);
  try {
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(firstList.section, 'staff');
    assert.equal(firstList.view, 'section');
    [...root.querySelectorAll('button')].find(node => node.textContent === 'Categorize existing person').click();
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(calls >= 2);
    [...root.querySelectorAll('button')].find(node => node.textContent === 'Categorize').click();
    assert.equal(document.querySelector('dialog [name=directory_section]').value, 'staff');
    assert.equal(document.querySelector('dialog [name=directory_subcategory]').closest('.field').hidden, false);
    document.querySelector('dialog [name=directory_subcategory]').value = 'Barangay Clerk';
    document.querySelector('dialog [name=directory_is_published]').checked = true;
    document.querySelector('dialog form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(saved.id, 17);
    assert.equal(saved.section, 'staff');
    assert.equal(saved.subcategory, 'Barangay Clerk');
    assert.equal(saved.isPublished, true);
    assert.equal(Object.hasOwn(saved, 'name'), false);
    assert.equal(Object.hasOwn(saved, 'designation'), false);
  } finally { cleanup(); root.remove(); document.querySelector('dialog')?.remove(); }
});
test('directory cards use a neutral icon when no uploaded photo is available', () => {
  const card = contentCard('directory_entries', { category: 'BHW', name: 'Sample Functionary', role_title: 'Barangay Health Worker' });
  assert.ok(card.classList.contains('directory-card'));
  assert.ok(card.querySelector('.directory-icon'));
  assert.equal(card.querySelector('img'), null);
});
test('officials roster follows the Barangay Council and SK hierarchy', () => {
  const official = (full_name, position) => ({ full_name, position, photo_url: `https://example.com/${encodeURIComponent(full_name)}.webp` });
  const roster = officialsRoster([
    official('SK Treasurer', 'SK Treasurer'), official('Barangay Treasurer', 'Barangay Treasurer'),
    official('Kagawad One', 'Barangay Kagawad'), official('SK Kagawad One', 'SK Kagawad'),
    official('Punong Barangay', 'Punong Barangay'), official('IPMR', 'IPMR'),
    official('Barangay Secretary', 'Barangay Secretary'), official('SK Chairperson', 'SK Chairperson'),
    official('SK Secretary', 'SK Secretary'),
  ]);
  assert.equal(roster.querySelectorAll('.official-group').length, 2);
  assert.deepEqual([...roster.querySelectorAll('.official-group-barangay .official-tier-heading')].map(node => node.textContent), ['Punong Barangay', 'Barangay Kagawad', 'IPMR, Barangay Secretary, and Barangay Treasurer']);
  assert.match(roster.querySelector('.official-group-barangay .official-tier-leader').textContent, /Punong Barangay/);
  assert.equal(roster.querySelectorAll('.official-group-barangay .official-tier-councilors .official-card').length, 1);
  assert.deepEqual([...roster.querySelectorAll('.official-tier-support .official-card h3')].map(node => node.textContent), ['IPMR', 'Barangay Secretary', 'Barangay Treasurer']);
  assert.match(roster.querySelector('.official-group-sk .official-tier-leader').textContent, /SK Chairperson/);
  assert.deepEqual([...roster.querySelectorAll('.official-group-sk .official-tier-heading')].map(node => node.textContent), ['SK Chairperson', 'SK Kagawad', 'SK Secretary and SK Treasurer']);
  assert.equal(roster.querySelectorAll('.official-group-sk .official-tier-councilors .official-card').length, 1);
  assert.deepEqual([...roster.querySelectorAll('.official-tier-sk-support .official-card h3')].map(node => node.textContent), ['SK Secretary', 'SK Treasurer']);
});
test('uploaded personnel photos open in an accessible previous and next viewer', () => {
  const root = document.createElement('main');
  root.append(
    contentCard('officials', { full_name: 'First Official', photo_url: 'https://example.com/first.webp' }),
    contentCard('directory_entries', { name: 'Second Functionary', category: 'BHW', photo_url: 'https://example.com/second.webp' }),
    contentCard('directory_entries', { name: 'No Photo', category: 'BNS' })
  );
  document.body.append(root);
  const cleanup = installPhotoViewer(root);
  try {
    const photos = root.querySelectorAll('[data-photo-viewer="true"]');
    assert.equal(photos.length, 2);
    assert.equal(photos[0].getAttribute('role'), 'button');
    assert.match(photos[0].getAttribute('aria-label'), /First Official/);
    photos[0].click();
    const dialog = document.querySelector('.photo-viewer');
    assert.ok(dialog.hasAttribute('open'));
    assert.equal(dialog.querySelector('.photo-viewer-image').getAttribute('src'), 'https://example.com/first.webp');
    assert.equal(dialog.querySelector('.photo-viewer-count').textContent, '1 of 2');
    dialog.querySelector('.photo-viewer-next').click();
    assert.equal(dialog.querySelector('.photo-viewer-image').getAttribute('src'), 'https://example.com/second.webp');
    assert.equal(dialog.querySelector('.photo-viewer-count').textContent, '2 of 2');
    dialog.querySelector('.photo-viewer-next').click();
    assert.equal(dialog.querySelector('.photo-viewer-count').textContent, '1 of 2');
    dialog.querySelector('.photo-viewer-close').click();
    assert.equal(dialog.hasAttribute('open'), false);
  } finally { cleanup(); root.remove(); }
});
test('Community Gallery photos use the same viewer without mixing photo groups', () => {
  const root = document.createElement('main');
  root.append(
    contentCard('officials', { full_name: 'Barangay Official', photo_url: 'https://example.com/official.webp' }),
    contentCard('gallery_items', { title: 'Community Activity', image_url: 'https://example.com/activity.webp' }),
    contentCard('gallery_items', { title: 'Barangay Event', image_url: 'https://example.com/event.webp' })
  );
  document.body.append(root);
  const cleanup = installPhotoViewer(root);
  try {
    const galleryPhotos = root.querySelectorAll('[data-photo-group="gallery_items"]');
    assert.equal(galleryPhotos.length, 2);
    galleryPhotos[0].click();
    const dialog = document.querySelector('.photo-viewer');
    assert.equal(dialog.querySelector('.photo-viewer-count').textContent, '1 of 2');
    dialog.querySelector('.photo-viewer-next').click();
    assert.equal(dialog.querySelector('.photo-viewer-image').getAttribute('src'), 'https://example.com/event.webp');
    assert.equal(dialog.querySelector('.photo-viewer-count').textContent, '2 of 2');
  } finally { cleanup(); root.remove(); }
});
test('website confirmation dialog resolves without a browser confirm popup', async () => {
  const decision = confirmationDialog({ title: 'Delete service?', description: 'This removes the record.', confirmLabel: 'Delete record', destructive: true });
  assert.match(document.querySelector('dialog').textContent, /Delete service/);
  [...document.querySelectorAll('button')].find(node => node.textContent === 'Delete record').click();
  assert.equal(await decision, true);
  assert.equal(document.querySelector('dialog'), null);
});
test('view details dialog exposes all record fields before editing', () => {
  const close = detailsDialog({ title: 'View service', fields: [{ key: 'name' }, { key: 'is_active' }], record: { name: 'Barangay clearance', is_active: true } });
  assert.match(document.querySelector('dialog').textContent, /Barangay clearance/);
  assert.match(document.querySelector('dialog').textContent, /Yes/);
  close(); close();
  assert.equal(document.querySelector('dialog'), null);
});

/** No iframe or network runs here: the recorded message is the isolated preview contract. */
function studioFixture(options = {}) {
  const previousLocation = globalThis.location;
  globalThis.location = { origin: 'https://preview.example.test' };
  const root = document.createElement('main'); document.body.append(root);
  const cleanup = mountStudio(root, options);
  const messages = [];
  Object.defineProperty(root.querySelector('iframe'), 'contentWindow', { value: { postMessage: (message, origin) => messages.push({ message: structuredClone(message), origin }) } });
  const click = text => [...root.querySelectorAll('button')].find(button => button.textContent === text).click();
  return { root, messages, click, cleanup: () => { cleanup(); root.remove(); globalThis.location = previousLocation; } };
}
test('third picker synchronizes hex and preview, rejects invalid input, and supports discard/reset', () => {
  const fixture = studioFixture();
  try {
    const { root, messages, click } = fixture;
    assert.equal(root.querySelectorAll('input[type=color]').length, 3);
    const picker = root.querySelector('#design-secondary');
    assert.equal(root.querySelector('label[for=design-secondary]').firstChild.textContent, 'Secondary color');
    const hex = root.querySelector('[aria-label="Secondary color hex code"]');
    picker.value = '#ffffff'; picker.dispatchEvent(new window.Event('input'));
    assert.equal(hex.value, '#FFFFFF');
    assert.equal(messages.at(-1).message.config.secondary, '#ffffff');
    assert.equal(messages.at(-1).message.config.primary, presetDesign().primary);
    assert.equal(messages.at(-1).origin, 'https://preview.example.test');
    hex.value = '#123456'; hex.dispatchEvent(new window.Event('input'));
    assert.equal(picker.value, '#123456');
    hex.value = 'invalid'; hex.dispatchEvent(new window.Event('blur'));
    assert.equal(hex.value, '#123456');
    assert.match(root.querySelector('.studio-message').textContent, /last valid color was kept/);
    click('Discard changes'); assert.equal(picker.value, presetDesign().secondary);
    picker.value = '#000000'; picker.dispatchEvent(new window.Event('input'));
    click('Reset to Modern LGU default'); assert.equal(picker.value, presetDesign().secondary);
    assert.equal([...root.querySelectorAll('button')].find(button => button.textContent === 'Preview only').disabled, true);
  } finally { fixture.cleanup(); }
});
test('expanded controls publish only validated choices and preview the existing Dashboard cover', () => {
  const cover = { id: 'existing-cover', url: 'https://example.com/existing-cover.webp', alt: 'Existing cover' };
  const fixture = studioFixture({ previewCovers: [cover] });
  try {
    const overlay = fixture.root.querySelector('#design-heroOverlay');
    const tone = fixture.root.querySelector('#design-heroTone');
    const footer = fixture.root.querySelector('#design-footerStyle');
    assert.ok(overlay); assert.ok(tone); assert.ok(footer);
    assert.ok(fixture.root.querySelectorAll('.control-grid select').length >= 18);
    overlay.value = 'balanced'; overlay.dispatchEvent(new window.Event('change'));
    tone.value = 'secondary'; tone.dispatchEvent(new window.Event('change'));
    const message = fixture.messages.at(-1).message;
    assert.equal(message.config.heroOverlay, 'balanced');
    assert.equal(message.config.heroTone, 'secondary');
    assert.deepEqual(message.covers, [cover]);
  } finally { fixture.cleanup(); }
});
test('secondary draft calls the existing publish service only after confirmation', async () => {
  const saved = []; const published = [];
  const fixture = studioFixture({ service: { publish: async config => { saved.push(structuredClone(config)); return { config }; } }, onPublished: config => published.push(config) });
  try {
    const picker = fixture.root.querySelector('#design-secondary');
    picker.value = '#123456'; picker.dispatchEvent(new window.Event('input'));
    assert.equal(saved.length, 0);
    fixture.click('Publish Everywhere ↗'); assert.equal(saved.length, 0);
    fixture.click('Confirm publish');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(saved.length, 1); assert.equal(saved[0].secondary, '#123456');
    assert.equal(published[0].secondary, '#123456');
    assert.match(fixture.root.querySelector('.studio-message').textContent, /Published everywhere/);
  } finally { fixture.cleanup(); }
});
test('service screens avoid fee wording and clarify that online payments are not collected', () => {
  assert.equal(labelFor('fee_text'), 'Office instructions');
  const card = contentCard('services', { name: 'Barangay document', fee_text: 'Visit the Barangay Hall for official processing details.' });
  assert.match(card.textContent, /Office instructions/);
  assert.doesNotMatch(card.textContent, /\bfees?\b/i);
});
test('English interface copy does not translate stored barangay content', () => {
  assert.equal(showRecords([], []).textContent, 'No records yet.');
  assert.match(accessSurface('login').textContent, /Use your existing email and password/);
  assert.match(contentCard('announcements', { title: 'Pabatid sa mga residente', excerpt: 'Libreng serbisyo' }).textContent, /Pabatid sa mga residenteLibreng serbisyo/);
});
test('Admin login says Welcome and reuses only the existing Cover 1 record', () => {
  const root = accessSurface('login', { barangay_name: 'Sibulan' }); document.body.append(root);
  try {
    assert.equal(root.querySelector('.access-card h1').textContent, 'Welcome.');
    assert.equal(applyAccessCover(root, { url: 'https://example.com/cover-one.webp', alt: 'Existing cover' }), true);
    assert.equal(root.querySelectorAll('.access-cover-media img').length, 1);
    assert.equal(root.querySelector('.access-cover-media img').getAttribute('src'), 'https://example.com/cover-one.webp');
    assert.equal(applyAccessCover(root, { url: 'javascript:alert(1)' }), false);
    assert.equal(root.querySelector('.access-cover-media'), null);
  } finally { root.remove(); }
});
test('saved Dashboard cover is reused inside the public hero without a duplicate image source', () => {
  const cover = { id: 'barangay-hall', url: 'https://example.com/barangay-hall.webp', alt: 'Barangay hall', caption: 'Public service center' };
  const home = publicHome({ barangay_name: 'Sibulan', hero_title: 'Local Government of Sibulan' }, {}, presetDesign(), { preview: true, covers: [cover] });
  const hero = home.querySelector('.hero');
  assert.ok(hero.classList.contains('has-cover'));
  assert.equal(hero.querySelector('.hero-cover img').getAttribute('src'), cover.url);
  assert.equal(home.querySelectorAll('.cover-slideshow').length, 1);
  assert.equal(hero.parentElement.querySelector(':scope > .cover-slideshow'), null);
  home.dispose();
});
test('hero cover advances by clicking the color layer without visible controls and uses five-second autoplay', () => {
  const covers = [
    { id: 'hall', url: 'https://example.com/hall.webp', alt: 'Barangay hall' },
    { id: 'community', url: 'https://example.com/community.webp', alt: 'Community activity' },
  ];
  const home = publicHome({ barangay_name: 'Sibulan' }, {}, presetDesign(), { preview: true, covers });
  const hero = home.querySelector('.hero');
  const image = hero.querySelector('.hero-cover img');
  assert.equal(CAROUSEL_INTERVAL_MS, 5000);
  assert.equal(hero.querySelector('.slideshow-controls'), null);
  assert.equal(image.getAttribute('src'), covers[0].url);
  hero.dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.equal(image.getAttribute('src'), covers[1].url);
  home.dispose();
});
test('homepage keeps the existing plain hero fallback when no cover is saved', () => {
  const home = publicHome({ barangay_name: 'Sibulan', hero_title: 'Local Government of Sibulan' }, {}, presetDesign(), { preview: true });
  const hero = home.querySelector('.hero');
  assert.equal(hero.classList.contains('has-cover'), false);
  assert.equal(home.querySelector('.cover-slideshow'), null);
});


test('public footer has structured navigation and preserves configured barangay identity', () => {
  const fragment = publicFooter({ barangay_name: 'Sibulan', municipality_city: 'Sta. Cruz', province: 'Davao del Sur' }, { preview: true });
  const footer = fragment.querySelector('.public-footer');
  assert.ok(footer.querySelector('.footer-identity'));
  assert.equal(footer.querySelectorAll('.footer-column').length, 3);
  assert.match(footer.textContent, /Barangay Sibulan/);
  assert.match(footer.textContent, /Transparency & reports/);
  assert.ok(fragment.querySelector('.map-section'));
});

test('section save preserves other drafts and section reset stays isolated', async () => {
  const saved = [];
  const fixture = studioFixture({ service: { publish: async config => { saved.push(structuredClone(config)); return { config }; } } });
  try {
    const picker = fixture.root.querySelector('#design-primary');
    picker.value = '#123456'; picker.dispatchEvent(new window.Event('input'));
    const hero = fixture.root.querySelector('#design-heroHeight');
    hero.value = 'tall'; hero.dispatchEvent(new window.Event('change'));
    fixture.click('Save Hero');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(saved[0].heroHeight, 'tall');
    assert.equal(saved[0].primary, presetDesign().primary);
    assert.equal(picker.value, '#123456');
    fixture.click('Reset Appearance');
    assert.equal(picker.value, presetDesign().primary);
    assert.equal(hero.value, 'tall');
  } finally { fixture.cleanup(); }
});
test('failed section save retains the draft for retry', async () => {
  const fixture = studioFixture({ service: { publish: async () => { throw new Error('Conflict'); } } });
  try {
    const hero = fixture.root.querySelector('#design-heroHeight');
    hero.value = 'tall'; hero.dispatchEvent(new window.Event('change'));
    fixture.click('Save Hero');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(hero.value, 'tall');
    assert.match(fixture.root.querySelector('.studio-message').textContent, /not saved: Conflict/);
    assert.equal([...fixture.root.querySelectorAll('button')].find(node => node.textContent === 'Save Hero').disabled, false);
  } finally { fixture.cleanup(); }
});
