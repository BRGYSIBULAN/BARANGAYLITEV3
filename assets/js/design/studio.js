/**
 * Purpose: central layout, color, and typography editor with an isolated draft preview.
 * Depends on: model.js, preview.html, and an optional authenticated design service.
 * Debug: draft stays in memory; section Save or confirmed Publish uses the existing protected service.
 */
import { element as el } from '../core/dom.js?v=96b812c63105';
import { PRESETS, presetDesign, normalizeDesign, sameDesign } from './model.js?v=96b812c63105';

/** One editor powers the safe public demo and the protected publishing workspace. */
export function mountStudio(root, { snapshot = { config: presetDesign() }, service = null, previewUrl = 'preview.html', previewCovers = [], onPublished = () => {} } = {}) {
  let baseline = snapshot;
  let draft = normalizeDesign(snapshot.config);
  let busy = false;
  let disposed = false;
  let surface = 'public';
  const channel = crypto.randomUUID();
  const heading = el('div', '', { class: 'studio-heading' });
  const headingCopy = el('div');
  headingCopy.append(el('p', 'WORKSPACE / APPEARANCE', { class: 'eyebrow muted' }), el('h1', 'Design Studio'), el('p', 'One identity. Every screen. Edit a section, check the preview, then use its Save button. Other unsaved sections stay in preview.', { class: 'muted' }));
  const actions = el('div', '', { class: 'studio-actions' });
  const revert = el('button', 'Discard changes', { type: 'button' });
  const reload = el('button', 'Reload published', { type: 'button' });
  reload.hidden = !service;
  const publish = el('button', service ? 'Publish Everywhere ↗' : 'Preview only', { type: 'button', class: 'primary' });
  actions.append(reload, revert, publish); heading.append(headingCopy, actions);
  // Leave live editing outside the sample iframe; the destination retains existing role checks.
  const editingNote = el('div', '', { class: 'notice studio-editing-note' });
  editingNote.append(el('p', 'This area previews appearance. Edit homepage text, contact details, and maintenance mode in the live Page Settings.'), el('a', 'Open live Page Settings →', { href: service ? '#settings' : 'admin/index.html#settings', class: 'button' }));
  const message = el('p', service ? 'Published design loaded. Changes stay in preview until you publish.' : 'Safe playground · Sample content only. Sign in to an authorized staff workspace to publish.', { class: 'studio-message', role: 'status', 'aria-live': 'polite' });
  const confirmation = el('div', '', { class: 'confirmation', hidden: true });
  confirmation.append(el('p', 'Publish this design to Public, System Admin, Content Admin, Login, Application, and Activation? Existing accounts and records will not change.'));
  const confirm = el('button', 'Confirm publish', { type: 'button', class: 'primary' });
  const cancel = el('button', 'Keep editing', { type: 'button' });
  confirmation.append(confirm, cancel);
  const layout = el('div', '', { class: 'studio-layout' });
  const controls = el('div', '', { class: 'studio-controls' });
  const themes = el('section', '', { class: 'control-panel' });
  themes.append(el('h2', '01 / Choose your layout'), el('p', 'Choose the page structure. Colors and other settings stay as you set them.', { class: 'muted' }));
  const themeList = el('div', '', { class: 'theme-list' });
  const themeButtons = [];
  for (const [key, def] of Object.entries(PRESETS)) {
    const button = el('button', '', { type: 'button', class: 'theme-option', 'aria-pressed': key === draft.preset });
    const glyph = el('span', '', { class: 'layout-glyph', 'data-layout': key, 'aria-hidden': 'true' });
    for (let i = 0; i < 4; i++) glyph.append(el('span'));
    const copy = el('span'); copy.append(el('strong', def.name), el('small', def.description));
    button.append(glyph, copy); button.addEventListener('click', () => { draft.preset = key; update(); });
    themeButtons.push([key, button]); themeList.append(button);
  }
  themes.append(themeList);
  const tokens = el('section', '', { class: 'control-panel' });
  tokens.append(el('h2', '02 / Make it yours'));
  const inputs = {};
  // All three pickers share validation, draft, reset, and confirmed-publish behavior.
  for (const [key, label] of [['primary', 'Main color'], ['secondary', 'Secondary color'], ['accent', 'Accent color']]) {
    const field = el('div', '', { class: 'color-field' });
    const caption = el('label', label, { for: `design-${key}` }); const value = el('output'); caption.append(value);
    const input = el('input', '', { id: `design-${key}`, type: 'color', value: draft[key] });
    input.addEventListener('input', () => { draft[key] = input.value; update(); });
    const hex = el('input', '', { type: 'text', value: draft[key], maxlength: 7, 'aria-label': `${label} hex code`, class: 'hex-input', spellcheck: 'false' });
    // Invalid text never reaches CSS or publishing; restore the last valid color on commit.
    const commitHex = strict => {
      if (/^#[\da-f]{6}$/i.test(hex.value)) { draft[key] = hex.value; update(); }
      else if (strict) { message.textContent = 'Use a full hex color such as #164B3F. The last valid color was kept.'; update(); }
    };
    // Input makes valid keyboard/paste edits immediate; blur validates incomplete text.
    hex.addEventListener('input', () => commitHex(false));
    hex.addEventListener('blur', () => commitHex(true));
    const colors = el('div', '', { class: 'cluster' }); colors.append(hex, input);
    inputs[key] = { input, value, hex }; field.append(caption, colors); tokens.append(field);
    if (key === 'secondary') {
      input.setAttribute('aria-describedby', 'secondary-color-help');
      hex.setAttribute('aria-describedby', 'secondary-color-help');
      tokens.append(el('p', 'Quick-links panel, footer, colored staff sidebar, and login side panel.', { id: 'secondary-color-help', class: 'color-help muted' }));
    }
  }
  const addSelect = (parent, key, label, options) => {
    const field = el('div'); const input = el('select', '', { id: `design-${key}` });
    options.forEach(([value, title]) => input.append(el('option', title, { value })));
    input.addEventListener('change', () => { draft[key] = input.value; update(); });
    inputs[key] = { input }; field.append(el('label', label, { for: `design-${key}` }), input); parent.append(field);
  };
  const grid = el('div', '', { class: 'control-grid' });
  [
    ['font', 'Heading font', [['humanist', 'Humanist'], ['classic', 'Classic serif'], ['contemporary', 'Contemporary'], ['geometric', 'Geometric'], ['friendly', 'Friendly']]],
    ['bodyFont', 'Body font', [['humanist', 'Humanist'], ['classic', 'Classic serif'], ['contemporary', 'Contemporary'], ['geometric', 'Geometric'], ['friendly', 'Friendly']]],
    ['corners', 'Corners', [['square', 'Square'], ['soft', 'Soft'], ['round', 'Rounded'], ['extra-round', 'Extra rounded']]],
    ['sidebar', 'Staff navigation', [['dark', 'Secondary color'], ['light', 'Light']]],
    ['width', 'Page width', [['boxed', 'Boxed'], ['wide', 'Wide'], ['full', 'Full']]],
    ['headerDensity', 'Header spacing', [['compact', 'Compact'], ['comfortable', 'Comfortable'], ['spacious', 'Spacious']]],
  ].forEach(option => addSelect(grid, ...option));
  tokens.append(grid, el('p', 'Button and colored-panel text contrast is adjusted automatically. All CSS stays in one shared design system.', { class: 'muted' }));

  const heroControls = el('section', '', { class: 'control-panel' });
  heroControls.append(el('h2', '03 / Hero photo & layer'), el('p', 'The saved Dashboard cover remains the source. These options change only how it is presented.', { class: 'muted' }));
  const heroGrid = el('div', '', { class: 'control-grid' });
  [
    ['heroOverlay', 'Photo visibility', [['soft', 'More visible'], ['balanced', 'Balanced'], ['strong', 'Subtle photo']]],
    ['heroOverlayStyle', 'Layer style', [['solid', 'Solid wash'], ['gradient', 'Directional gradient'], ['vignette', 'Soft vignette']]],
    ['heroTone', 'Layer color', [['primary', 'Main color'], ['secondary', 'Secondary color'], ['neutral', 'Neutral dark']]],
    ['heroImage', 'Photo treatment', [['natural', 'Natural'], ['muted', 'Muted'], ['monochrome', 'Monochrome']]],
    ['heroFocus', 'Photo position', [['top', 'Top'], ['center', 'Center'], ['bottom', 'Bottom']]],
    ['heroHeight', 'Hero height', [['compact', 'Compact'], ['standard', 'Balanced'], ['tall', 'Tall']]],
    ['heroAlign', 'Hero text', [['left', 'Left aligned'], ['center', 'Centered']]],
  ].forEach(option => addSelect(heroGrid, ...option));
  heroControls.append(heroGrid);

  const components = el('section', '', { class: 'control-panel' });
  components.append(el('h2', '04 / Surfaces & components'));
  const componentGrid = el('div', '', { class: 'control-grid' });
  [
    ['surface', 'Page background', [['clean', 'Clean white'], ['tinted', 'Theme tint'], ['contrast', 'High contrast']]],
    ['cardStyle', 'Card style', [['outlined', 'Outlined'], ['soft', 'Soft color'], ['elevated', 'Elevated']]],
    ['spacing', 'Section spacing', [['compact', 'Compact'], ['comfortable', 'Comfortable'], ['spacious', 'Spacious']]],
    ['navStyle', 'Navigation links', [['underline', 'Underline'], ['pills', 'Pills'], ['boxed', 'Boxed']]],
    ['footerStyle', 'Footer design', [['civic', 'Civic columns'], ['light', 'Light institutional'], ['banded', 'Accent band'], ['minimal', 'Minimal']]],
    ['officialsLayout', 'Officials arrangement', [['rows', 'Leadership rows'], ['pyramid', 'Triangle / pyramid'], ['compact', 'Compact grid']]],
  ].forEach(option => addSelect(componentGrid, ...option));
  components.append(componentGrid);
  const sections = [
    [themes, 'Layout', ['preset']],
    [tokens, 'Appearance', ['primary', 'secondary', 'accent', 'font', 'bodyFont', 'corners', 'sidebar', 'width', 'headerDensity']],
    [heroControls, 'Hero', ['heroOverlay', 'heroOverlayStyle', 'heroTone', 'heroImage', 'heroFocus', 'heroHeight', 'heroAlign']],
    [components, 'Components', ['surface', 'cardStyle', 'spacing', 'navStyle', 'footerStyle', 'officialsLayout']],
  ].map(([panel, label, keys]) => {
    const bar = el('div', '', { class: 'studio-section-actions' });
    const status = el('span', '', { role: 'status', 'aria-live': 'polite', class: 'muted' });
    const save = el('button', `Save ${label}`, { type: 'button', class: 'primary' });
    const undo = el('button', `Reset ${label}`, { type: 'button' });
    // Only this section is merged into the published baseline; other draft edits remain local.
    save.addEventListener('click', async () => {
      if (!service || busy) return;
      const next = normalizeDesign(baseline.config);
      keys.forEach(key => { next[key] = draft[key]; });
      busy = true; update(); message.textContent = `Saving ${label}…`;
      try {
        const saved = await service.publish(next, baseline);
        if (disposed) return;
        baseline = saved;
        keys.forEach(key => { draft[key] = saved.config[key]; });
        onPublished(saved.config);
        message.textContent = `${label} saved. Other unsaved sections remain in preview.`;
      } catch (error) { if (!disposed) message.textContent = `${label} not saved: ${error.message}`; }
      finally { busy = false; if (!disposed) update(); }
    });
    undo.addEventListener('click', () => {
      const saved = normalizeDesign(baseline.config);
      keys.forEach(key => { draft[key] = saved[key]; });
      update(); message.textContent = `${label} restored to its published settings.`;
    });
    bar.append(status, undo, save); panel.append(bar);
    return { keys, save, undo, status };
  });
  const reset = el('button', 'Reset to Modern LGU default', { type: 'button' });
  reset.addEventListener('click', () => { draft = presetDesign(); update(); message.textContent = 'Default restored in preview only. Publish to make it live.'; });
  tokens.append(reset); controls.append(themes, tokens, heroControls, components);
  const preview = el('section', '', { class: 'preview-area', 'aria-label': 'Design preview' });
  const toolbar = el('div', '', { class: 'preview-toolbar' });
  const surfaceSelect = el('select', '', { 'aria-label': 'Preview screen' });
  [['public', 'Public website'], ['admin', 'System Admin'], ['editor', 'Content Admin'], ['login', 'Login'], ['signup', 'Signup / Application'], ['activation', 'Activation']].forEach(([value, label]) => surfaceSelect.append(el('option', label, { value })));
  surfaceSelect.addEventListener('change', () => { surface = surfaceSelect.value; send(); });
  const devices = el('div', '', { class: 'segmented', 'aria-label': 'Preview width' });
  const canvas = el('div', '', { class: 'preview-canvas', 'data-device': 'desktop' });
  for (const name of ['desktop', 'tablet', 'mobile']) {
    const button = el('button', name[0].toUpperCase() + name.slice(1), { type: 'button', 'aria-pressed': name === 'desktop' });
    button.addEventListener('click', () => { canvas.dataset.device = name; devices.querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', item === button)); }); devices.append(button);
  }
  const frame = el('iframe', '', { class: 'preview-frame', title: 'Isolated website design preview', src: `${previewUrl}?channel=${encodeURIComponent(channel)}`, sandbox: 'allow-scripts allow-same-origin' });
  canvas.append(frame); toolbar.append(surfaceSelect, devices);
  const caption = el('div', '', { class: 'preview-caption' });
  const selected = el('span'); caption.append(selected, el('span', 'Sample content · Changes are not live'));
  preview.append(toolbar, canvas, caption); layout.append(controls, preview);
  root.replaceChildren(heading, editingNote, confirmation, layout, message);

  /** postMessage is scoped by origin, window identity, and an unpredictable frame channel. */
  function send() { if (!disposed) frame.contentWindow?.postMessage({ type: 'brgy-design-preview', channel, config: draft, surface, covers: previewCovers }, location.origin); }
  function update() {
    draft = normalizeDesign(draft); confirmation.hidden = true;
    themeButtons.forEach(([key, button]) => { button.setAttribute('aria-pressed', key === draft.preset); button.disabled = busy; });
    for (const [key, { input, value, hex }] of Object.entries(inputs)) { input.value = draft[key]; input.disabled = busy; if (value) value.textContent = draft[key].toUpperCase(); if (hex) { hex.value = draft[key].toUpperCase(); hex.disabled = busy; } }
    const current = normalizeDesign(baseline.config);
    sections.forEach(({ keys, save, undo, status }) => {
      const changed = keys.some(key => draft[key] !== current[key]);
      save.disabled = !service || busy || !changed;
      undo.disabled = busy || !changed;
      status.textContent = changed ? 'Unsaved changes' : 'Matches published';
    });
    const dirty = !sameDesign(draft, baseline.config);
    publish.disabled = !service || busy || !dirty; revert.disabled = busy || !dirty; reset.disabled = busy; reload.disabled = busy;
    selected.textContent = `${PRESETS[draft.preset].name} · ${dirty ? 'Unpublished draft' : 'Current design'}`;
    send();
  }
  function receive(event) { if (event.origin === location.origin && event.source === frame.contentWindow && event.data?.channel === channel && event.data?.type === 'brgy-design-ready') send(); }
  window.addEventListener('message', receive); frame.addEventListener('load', send);
  revert.addEventListener('click', () => { draft = normalizeDesign(baseline.config); update(); message.textContent = 'Unpublished changes discarded.'; });
  reload.addEventListener('click', async () => {
    if (!service || busy) return;
    // Keep a conflicted draft so the owner can compare it to the newly loaded baseline.
    busy = true; update();
    try {
      const latest = await service.read();
      if (disposed) return;
      baseline = latest; message.textContent = 'Latest published design loaded. Your draft is preserved; review it before publishing, or Discard changes to use the published version.';
    } catch (error) { if (!disposed) message.textContent = `Could not reload: ${error.message}`; }
    finally { busy = false; if (!disposed) update(); }
  });
  publish.addEventListener('click', () => { confirmation.hidden = false; confirm.focus(); });
  cancel.addEventListener('click', () => { confirmation.hidden = true; publish.focus(); });
  confirm.addEventListener('click', async () => {
    if (!service || busy || sameDesign(draft, baseline.config)) return;
    busy = true; update(); confirm.disabled = true; message.textContent = 'Publishing the shared design…';
    try {
      const saved = await service.publish(draft, baseline);
      if (disposed) return;
      baseline = saved; onPublished(saved.config); message.textContent = 'Published everywhere. Open screens refresh on focus or within one minute.';
    } catch (error) { if (!disposed) message.textContent = `Not published: ${error.message}`; }
    finally { busy = false; confirm.disabled = false; if (!disposed) update(); }
  });
  const beforeUnload = event => { if (!sameDesign(draft, baseline.config)) { event.preventDefault(); event.returnValue = ''; } };
  window.addEventListener('beforeunload', beforeUnload); update();
  const cleanup = () => { disposed = true; window.removeEventListener('message', receive); window.removeEventListener('beforeunload', beforeUnload); };
  cleanup.canLeave = () => !busy && (sameDesign(draft, baseline.config) || window.confirm('Discard unpublished design changes and leave the Design Studio?'));
  return cleanup;
}
