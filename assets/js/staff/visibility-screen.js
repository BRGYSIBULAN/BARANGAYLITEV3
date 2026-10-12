/**
 * Purpose: give System Admin separate Save controls for every public module and Directory heading.
 * Depends on: visibility and content services plus the shared staff UI primitives.
 * Debug: each card owns one dirty value; saving one card must preserve other unsaved cards.
 */
import { element as el } from '../core/dom.js?v=96b812c63105';
import { heading, button, badge } from './ui.js?v=96b812c63105';
import { VISIBILITY_MODULES, defaultVisibility, moduleVisible } from '../data/visibility.js?v=96b812c63105';
import { DIRECTORY_SUBCATEGORIES } from '../data/contracts.js?v=96b812c63105';

const cloneConfig = config => ({ version: 1, modules: { ...config.modules }, groups: { ...config.groups } });

/** Read actual saved categories so headings follow this barangay instead of a fixed generic roster. */
async function readDirectoryHeadings(directory) {
  return (await directory.headings()).sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
}

/** The returned cleanup protects unsaved switches when navigating inside the workspace. */
export function mountVisibility(root, services, isCurrent) {
  let disposed = false, busy = false, loadSequence = 0;
  let current = defaultVisibility(), draft = defaultVisibility(), headings = [];
  const active = () => !disposed && isCurrent();
  const message = el('p', 'Loading public visibility…', { role: 'status', 'aria-live': 'polite', class: 'module-message' });
  const controls = el('div', '', { class: 'visibility-sections' });
  const reload = button('Reload visibility', () => load());
  heading(root, 'Public visibility', 'Turn public modules and actual Directory headings on or off. Every card saves independently; hidden data stays stored and editable.', [reload]);
  root.append(message, controls);

  const directModule = key => draft.modules[key] !== false;
  const dirtyModule = key => draft.modules[key] !== current.modules[key];
  const directGroup = name => draft.groups[name] !== false;
  const dirtyGroup = name => directGroup(name) !== (current.groups[name] !== false);
  const hasDirty = () => VISIBILITY_MODULES.some(item => dirtyModule(item.key)) || headings.some(item => dirtyGroup(item.name));

  function statusForModule(def) {
    if (!directModule(def.key)) return ['OFF · hidden publicly', ''];
    if (!moduleVisible(draft, def.key)) return [`ON · hidden by ${VISIBILITY_MODULES.find(item => item.key === def.parent)?.label || 'parent'}`, 'warning'];
    return ['ON · visible publicly', 'good'];
  }

  function visibilityCard({ key, label, description, parent, group = false, section }) {
    const card = el('article', '', { class: 'dashboard-panel visibility-card' });
    const top = el('div', '', { class: 'visibility-card-top' });
    const copy = el('div'); copy.append(el('h3', label), el('p', description, { class: 'muted compact' }));
    const checked = group ? directGroup(key) : directModule(key);
    const switchId = `visibility-${group ? 'group' : 'module'}-${String(key).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    const input = el('input', '', { id: switchId, type: 'checkbox', role: 'switch', 'aria-label': `${label} public visibility` }); input.checked = checked;
    const switchLabel = el('label', '', { for: switchId, class: 'visibility-switch' }); switchLabel.append(input, el('span', '', { 'aria-hidden': 'true' }));
    top.append(copy, switchLabel); card.append(top);
    const groupParent = section === 'staff' ? 'staff' : 'functionaries';
    const effective = group
      ? !directGroup(key) ? ['OFF · hidden publicly', ''] : !moduleVisible(draft, groupParent) ? [`ON · hidden by ${VISIBILITY_MODULES.find(item => item.key === groupParent)?.label || 'Directory'}`, 'warning'] : ['ON · visible publicly', 'good']
      : statusForModule({ key, parent });
    const state = badge(effective[0], effective[1]);
    const save = button(`Save ${label} visibility`, () => saveOne());
    save.disabled = group ? !dirtyGroup(key) : !dirtyModule(key);
    const footer = el('div', '', { class: 'visibility-card-actions' }); footer.append(state, save); card.append(footer);
    input.addEventListener('change', () => {
      if (group) draft.groups[key] = input.checked; else draft.modules[key] = input.checked;
      draw(); message.textContent = `${label} has an unsaved visibility change.`;
    });
    async function saveOne() {
      if (busy || !active()) return;
      busy = true; draw(); message.textContent = `Saving ${label} visibility…`;
      // Retain every other unsaved card while replacing the confirmed server snapshot.
      const unsavedModules = Object.fromEntries(VISIBILITY_MODULES.filter(item => dirtyModule(item.key) && (group || item.key !== key)).map(item => [item.key, draft.modules[item.key]]));
      const unsavedGroups = Object.fromEntries(headings.filter(item => dirtyGroup(item.name) && (!group || item.name !== key)).map(item => [item.name, draft.groups[item.name]]));
      try {
        const saved = group ? await services.visibility.saveGroup(key, input.checked) : await services.visibility.saveModule(key, input.checked);
        if (!active()) return;
        current = cloneConfig(saved.config);
        draft = cloneConfig(saved.config);
        Object.assign(draft.modules, unsavedModules); Object.assign(draft.groups, unsavedGroups);
        message.textContent = `${label} visibility saved. ${input.checked ? 'It is enabled.' : 'Its records remain stored but are hidden publicly.'}`;
      } catch (error) { if (active()) message.textContent = `Not saved: ${error.message}`; }
      finally { busy = false; if (active()) draw(); }
    }
    return card;
  }

  function draw() {
    controls.replaceChildren(); reload.disabled = busy;
    for (const area of [...new Set(VISIBILITY_MODULES.map(item => item.area))]) {
      const section = el('section', '', { class: 'visibility-section' });
      section.append(el('h2', area));
      const grid = el('div', '', { class: 'visibility-grid' });
      VISIBILITY_MODULES.filter(item => item.area === area).forEach(item => grid.append(visibilityCard(item)));
      section.append(grid); controls.append(section);
    }
    const groupSection = el('section', '', { class: 'visibility-section' });
    groupSection.append(el('h2', 'Directory subcategories'), el('p', 'These headings come from the subcategory assigned to existing database people. Turning one off hides its member list without deleting the person or ID record.', { class: 'muted' }));
    const groupGrid = el('div', '', { class: 'visibility-grid' });
    if (headings.length) headings.forEach(item => groupGrid.append(visibilityCard({ key: item.name, label: item.name, section: item.section, description: `${item.section === 'staff' ? 'Barangay Staff' : 'Barangay Functionaries'} heading and member list.`, group: true })));
    else groupGrid.append(el('p', 'No Staff or Functionary subcategories are assigned yet. Categorize an existing database person from Directory first.', { class: 'empty' }));
    groupSection.append(groupGrid); controls.append(groupSection);
    controls.querySelectorAll('input,button').forEach(node => { if (busy) node.disabled = true; });
  }

  async function load() {
    if (busy || !active()) return;
    if (hasDirty() && !window.confirm('Discard unsaved visibility changes and reload?')) return;
    const request = ++loadSequence; busy = true; draw(); message.textContent = 'Loading public visibility…';
    try {
      const [snapshot, actualHeadings] = await Promise.all([services.visibility.read(), readDirectoryHeadings(services.directory)]);
      if (!active() || request !== loadSequence) return;
      current = cloneConfig(snapshot.config); draft = cloneConfig(snapshot.config);
      const known = new Map(actualHeadings.map(item => [item.name, item]));
      Object.keys(snapshot.config.groups).forEach(name => {
        if (!known.has(name)) known.set(name, { name, section: DIRECTORY_SUBCATEGORIES.staff.includes(name) ? 'staff' : 'functionaries' });
      });
      headings = [...known.values()].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
      message.textContent = 'Visibility loaded. Change one switch, then use that card’s Save button.';
    } catch (error) { if (active() && request === loadSequence) message.textContent = error.message; }
    finally { busy = false; if (active() && request === loadSequence) draw(); }
  }

  draw(); load();
  const cleanup = () => { disposed = true; loadSequence++; };
  cleanup.canLeave = () => !busy && (!hasDirty() || window.confirm('Discard unsaved visibility changes?'));
  return cleanup;
}
