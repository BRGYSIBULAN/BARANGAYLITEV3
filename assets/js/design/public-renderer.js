/**
 * Purpose: one text-safe public renderer used by the real site and Design Studio previews.
 * Depends on: model.js section ordering, DOM helpers, and published content/covers passed by caller.
 * Debug: inspect the data-section order and hero cover nesting; sample preview records never enter data services.
 */
import { element as el, safeLink } from '../core/dom.js?v=96b812c63105';
import { PRESETS, normalizeDesign } from './model.js?v=96b812c63105';
import { createCarousel } from '../public/carousel.js?v=96b812c63105';
import { defaultVisibility, moduleVisible } from '../data/visibility.js?v=96b812c63105';
export const SECTIONS = Object.freeze({ announcements: ['Latest updates', 'News & advisories'], services: ['For every resident', 'Barangay services'], officials: ['Public leadership', 'Your barangay officials'], disclosures: ['Open governance', 'Transparency & reports'], gallery_items: ['Life in our barangay', 'Community gallery'], pages: ['Our barangay', 'About & programs'], forms: ['Ready to download', 'Forms & documents'], directory_entries: ['Stay connected', 'Contact directory'] });

/** All links/images are constrained to HTTPS; database HTML is displayed as text, not executed. */
function https(value) { try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null; } catch { return null; } }
export function brand(settings, href = 'index.html') {
  const node = el('a', '', { class: 'brand', href });
  const logo = https(settings.logo_url);
  if (logo) node.append(el('img', '', { src: logo, alt: `${settings.barangay_name || 'Barangay'} seal`, width: 56, height: 56 }));
  else node.append(el('span', 'B', { class: 'brand-mark', 'aria-hidden': 'true' }));
  const copy = el('span');
  copy.append(el('small', 'Republic of the Philippines'), el('strong', `Barangay ${settings.barangay_name || 'Website'}`), el('small', [settings.municipality_city, settings.province].filter(Boolean).join(' · ')));
  node.append(copy);
  return node;
}

/** The same masthead/navigation is rendered on every public route. */
export function publicHeader(settings, route = 'home', visibility = defaultVisibility()) {
  const header = el('header', '', { class: 'public-header' });
  const utility = el('div', '', { class: 'utility' });
  const utilityInner = el('div', '', { class: 'container' });
  utilityInner.append(el('span', 'OFFICIAL BARANGAY WEBSITE'), el('span', 'PUBLIC INFORMATION & SERVICES'));
  utility.append(utilityInner);
  const masthead = el('div', '', { class: 'masthead container' });
  masthead.append(brand(settings, '#home'));
  const nav = el('nav', '', { class: 'public-nav', 'aria-label': 'Public information' });
  const links = el('div', '', { class: 'container' });
  const navLink = (href, label, active = false) => el('a', label, { href, 'aria-current': active ? 'page' : null });
  const navMenu = (label, items, activeRoutes) => {
    const visibleItems = items.filter(([, , , visibilityKey]) => moduleVisible(visibility, visibilityKey));
    if (!visibleItems.length) return null;
    const active = activeRoutes.includes(route);
    const menu = el('details', '', { class: 'nav-menu' });
    const panel = el('div', '', { class: 'nav-menu-panel' });
    visibleItems.forEach(([href, text, key]) => panel.append(navLink(href, text, route === key)));
    menu.append(el('summary', label, { 'aria-current': active ? 'page' : null }), panel);
    return menu;
  };
  links.append(navLink('#home', 'Home', route === 'home'));
  if (moduleVisible(visibility, 'announcements')) links.append(navLink('#announcements', 'News & Updates', route === 'announcements'));
  const menus = [
    navMenu('Services', [
      ['#services', 'Barangay Services', 'services', 'services'],
      ['verify.html', 'Verify Barangay ID', 'verify', 'verify'],
      ['#appointment', 'Request Appointment', 'appointment', 'appointment'],
      ['#forms', 'Downloadable Forms', 'forms', 'forms'],
    ], ['services', 'verify', 'appointment', 'forms']),
    navMenu('About', [
      ['#contact', 'Contact Us', 'contact', 'contact'],
      ['#pages', 'Barangay Profile', 'pages', 'pages'],
    ], ['contact', 'pages']),
    navMenu('Directory', [
      ['#officials', 'Barangay Officials', 'officials', 'officials'],
      ['#staff', 'Barangay Staff', 'staff', 'staff'],
      ['#functionaries', 'Barangay Functionaries', 'functionaries', 'functionaries'],
    ], ['officials', 'staff', 'functionaries']),
    moduleVisible(visibility, 'admin_portal') ? navMenu('Admin Portal', [
      ['login.html?next=settings', 'System Admin Login', 'system-admin', 'admin_portal'],
      ['login.html?next=pages', 'Content Admin Login', 'content-admin', 'admin_portal'],
    ], ['system-admin', 'content-admin']) : null,
  ].filter(Boolean);
  links.append(...menus);
  nav.append(links); header.append(utility, masthead, nav); return header;
}

/** Cards retain module-specific information; no invented dates, counts, processing details, or contacts. */
export function contentCard(table, row) {
  const directory = table === 'directory_entries';
  const official = table === 'officials';
  const personnelPhoto = table === 'officials' || directory;
  const viewerPhoto = personnelPhoto || table === 'gallery_items';
  const card = el('article', '', { class: ['content-card', directory && 'directory-card', official && 'official-card'].filter(Boolean).join(' ') });
  const imageUrl = https(row.cover_url || row.photo_url || row.image_url);
  const photoName = row.title || row.full_name || row.name || 'barangay personnel';
  if (imageUrl) card.append(el('img', '', {
    src: imageUrl,
    alt: photoName,
    loading: 'lazy',
    class: directory ? 'directory-avatar' : official ? 'official-photo' : null,
    'data-photo-viewer': viewerPhoto ? 'true' : null,
    // Officials and Directory personnel share one next/previous sequence; Gallery
    // stays separate so community photos never mix with personnel portraits.
    'data-photo-group': viewerPhoto ? (personnelPhoto ? 'personnel' : table) : null,
    'data-photo-caption': viewerPhoto ? photoName : null,
    tabindex: viewerPhoto ? '0' : null,
    role: viewerPhoto ? 'button' : null,
    'aria-haspopup': viewerPhoto ? 'dialog' : null,
    'aria-label': viewerPhoto ? `View larger photo of ${photoName}` : null,
  }));
  else if (directory) card.append(el('span', '', { class: 'directory-avatar directory-icon', 'aria-label': 'No photo uploaded' }));
  const category = row.category || row.position || row.album || (table === 'announcements' ? 'Barangay advisory' : null);
  if (category) card.append(el('p', category, { class: 'eyebrow' }));
  card.append(el('h3', row.title || row.name || row.full_name || 'Barangay information'));
  const text = row.excerpt || row.description || row.bio || row.caption || row.summary || row.role_title;
  if (text) card.append(el('p', text, { class: 'body-copy' }));
  if (table === 'services') {
    for (const [key, label] of [['requirements', 'Requirements'], ['fee_text', 'Office instructions'], ['processing_time', 'Processing time']]) {
      if (row[key]) { const details = el('details'); details.append(el('summary', label), el('p', row[key], { class: 'body-copy' })); card.append(details); }
    }
  }
  if (row.content) { const details = el('details'); details.append(el('summary', 'Read more'), el('p', row.content, { class: 'body-copy' })); card.append(details); }
  if (row.file_url) {
    const link = safeLink(row.file_url, 'View / download document ↗');
    if (['forms', 'disclosures'].includes(table)) link.dataset.publicMetric = `download.${table}`;
    card.append(link);
  }
  if (row.contact) card.append(el('p', row.contact));
  if (row.location) card.append(el('p', row.location));
  if (row.published_at || row.document_date) {
    const date = new Date(row.published_at || row.document_date);
    if (!Number.isNaN(date.getTime())) card.append(el('small', date.toLocaleDateString('en-PH', { dateStyle: 'medium' })));
  }
  return card;
}

/** Position text controls presentation only; the existing Officials rows and sort order stay authoritative. */
function officialSlot(row) {
  const position = String(row.position || '').trim().toLowerCase();
  const youth = /\bsk\b|sangguniang kabataan/.test(position);
  if (youth && /chair/.test(position)) return 'skLeader';
  if (youth && /secretary|treasurer/.test(position)) return 'skSupport';
  if (youth && /kagawad|councilor|councillor|member/.test(position)) return 'skCouncil';
  if (youth) return 'skOther';
  if (/punong barangay|barangay captain/.test(position)) return 'barangayLeader';
  if (/\bipmr\b|indigenous peoples.*representative|secretary|treasurer/.test(position)) return 'barangaySupport';
  if (/kagawad|councilor|councillor|council member/.test(position)) return 'barangayCouncil';
  return 'barangayOther';
}

/** Build the public officials page as a hierarchy without creating fixed or duplicate official records. */
export function officialsRoster(rows = []) {
  const slots = {
    barangayLeader: [], barangayCouncil: [], barangaySupport: [], barangayOther: [],
    skLeader: [], skCouncil: [], skSupport: [], skOther: [],
  };
  rows.forEach(row => slots[officialSlot(row)].push(row));
  const supportRank = row => /\bipmr\b|indigenous peoples/i.test(row.position || '') ? 0 : /secretary/i.test(row.position || '') ? 1 : /treasurer/i.test(row.position || '') ? 2 : 3;
  slots.barangaySupport.sort((a, b) => supportRank(a) - supportRank(b));
  slots.skSupport.sort((a, b) => supportRank(a) - supportRank(b));

  const tier = (name, label, records) => {
    if (!records.length) return null;
    const node = el('div', '', { class: `official-tier official-tier-${name}${records.length === 1 ? ' official-tier-single' : ''}`, 'aria-label': label });
    // The label makes the constitutional order readable at a glance; the cards
    // themselves still come only from the published directory records.
    node.append(el('h3', label, { class: 'official-tier-heading' }));
    records.forEach(row => node.append(contentCard('officials', row)));
    return node;
  };
  const group = (name, eyebrow, title, tiers) => {
    if (!tiers.some(([, , records]) => records.length)) return null;
    const section = el('section', '', { class: `official-group official-group-${name}` });
    const heading = el('header', '', { class: 'official-group-heading' });
    heading.append(el('p', eyebrow, { class: 'eyebrow' }), el('h2', title));
    section.append(heading);
    tiers.forEach(([tierName, label, records]) => { const node = tier(tierName, label, records); if (node) section.append(node); });
    return section;
  };

  const roster = el('div', '', { class: 'officials-roster' });
  const barangay = group('barangay', 'Local leadership', 'Barangay Council', [
    ['leader', 'Punong Barangay', slots.barangayLeader],
    ['councilors', 'Barangay Kagawad', slots.barangayCouncil],
    ['support', 'IPMR, Barangay Secretary, and Barangay Treasurer', slots.barangaySupport],
    ['other', 'Other Barangay Officials', slots.barangayOther],
  ]);
  const sk = group('sk', 'Youth leadership', 'Sangguniang Kabataan', [
    ['leader', 'SK Chairperson', slots.skLeader],
    ['councilors', 'SK Kagawad', slots.skCouncil],
    ['sk-support', 'SK Secretary and SK Treasurer', slots.skSupport],
    ['other', 'Other SK Officials', slots.skOther],
  ]);
  if (barangay) roster.append(barangay);
  if (sk) roster.append(sk);
  return roster;
}

/** Map and structured footer share existing settings; no contact or link data is invented. */
export function publicFooter(settings, { preview = false, visibility = defaultVisibility() } = {}) {
  const fragment = document.createDocumentFragment();
  let map;
  if (moduleVisible(visibility, 'map')) {
    map = el('section', '', { class: 'map-section' });
    const layout = el('div', '', { class: 'container map-layout' });
    const contact = el('div', '', { class: 'map-contact' });
    contact.append(el('p', 'BARANGAY PUBLIC ASSISTANCE', { class: 'eyebrow' }), el('h2', 'Visit your barangay hall'), el('p', settings.address || [settings.barangay_name, settings.municipality_city, settings.province].filter(Boolean).join(', ')));
    if (settings.contact_number) contact.append(el('p', settings.contact_number, { class: 'map-contact-line' }));
    if (settings.email) contact.append(el('p', settings.email, { class: 'map-contact-line' }));
    const slot = el('div', '', { class: 'map-slot' });
    const source = https(settings.map_embed_url);
    const url = source && new URL(source);
    if (url && ['www.google.com', 'maps.google.com'].includes(url.hostname) && url.pathname.startsWith('/maps') && !preview) slot.append(el('iframe', '', { src: url.href, title: 'Barangay hall map', loading: 'lazy', referrerpolicy: 'no-referrer', sandbox: 'allow-scripts allow-same-origin' }));
    else slot.append(el('p', preview ? 'Barangay hall map · preview placeholder' : 'Map will appear when an approved map link is configured.'));
    layout.append(contact, slot); map.append(layout);
  }

  const footer = el('footer', '', { class: 'public-footer' });
  const main = el('div', '', { class: 'footer-main container' });
  const identity = el('section', '', { class: 'footer-identity' });
  identity.append(brand(settings, '#home'), el('p', 'Official information, public services, and community updates from your Barangay Local Government Unit.'));

  const linkColumn = (title, items) => {
    const visibleItems = items.filter(([, , visibilityKey]) => !visibilityKey || moduleVisible(visibility, visibilityKey));
    if (!visibleItems.length) return null;
    const nav = el('nav', '', { class: 'footer-column', 'aria-label': title });
    nav.append(el('h3', title));
    const list = el('ul');
    visibleItems.forEach(([href, label]) => { const item = el('li'); item.append(el('a', label, { href })); list.append(item); });
    nav.append(list); return nav;
  };
  const explore = linkColumn('Explore', [['#home', 'Home', null], ['#announcements', 'News & Updates', 'announcements'], ['#pages', 'Barangay Profile', 'pages'], ['#disclosures', 'Transparency & reports', 'disclosures']]);
  const information = linkColumn('Directory', [['#officials', 'Barangay Officials', 'officials'], ['#staff', 'Barangay Staff', 'staff'], ['#functionaries', 'Barangay Functionaries', 'functionaries']]);
  const services = linkColumn('Resident services', [['#services', 'Barangay Services', 'services'], ['#appointment', 'Request Appointment', 'appointment'], ['#forms', 'Downloadable Forms', 'forms'], ['verify.html', 'Verify Barangay ID', 'verify']]);
  main.append(identity, ...[explore, information, services].filter(Boolean));

  const bottom = el('div', '', { class: 'footer-bottom' });
  const bottomInner = el('div', '', { class: 'container' });
  bottomInner.append(el('p', `Barangay Local Government Unit of ${settings.barangay_name || 'the community'}`), el('p', [settings.municipality_city, settings.province].filter(Boolean).join(' · ') || 'Official public information website'));
  bottom.append(bottomInner); footer.append(main, bottom);
  if (map) fragment.append(map);
  fragment.append(footer); return fragment;
}

/** Layout-specific hero and DOM section order make presets genuinely different layouts. */
export function publicHome(settings, content, config, { preview = false, errors = {}, covers = [], visibility = defaultVisibility() } = {}) {
  const design = normalizeDesign(config);
  const root = el('div', '', { class: 'public-surface' });
  root.append(publicHeader(settings, 'home', visibility));
  const main = el('main', '', { id: 'public-main', tabindex: '-1', class: 'container' });
  const hero = el('section', '', { class: 'hero' });
  if (moduleVisible(visibility, 'hero') && covers.length) {
    // Reuse the System Dashboard cover result as presentation only. Keeping the
    // carousel inside the hero avoids a second image record or hardcoded URL.
    const carousel = createCarousel(covers, { autoplay: !preview });
    carousel.element.classList.add('hero-cover');
    hero.classList.add('has-cover');
    hero.append(carousel.element);
    hero.addEventListener('click', event => {
      // The photo/color layer advances without exposing a separate control panel.
      // Links, forms, and buttons keep their normal actions inside the same hero.
      if (covers.length > 1 && !event.target.closest?.('a,button,input,select,textarea,form,label')) carousel.next();
    });
    root.dispose = carousel.dispose;
  }
  const copy = el('div', '', { class: 'hero-copy' });
  const featured = design.preset === 'executive-civic' && (content.announcements?.find(row => row.is_featured) || content.announcements?.[0]);
  copy.append(el('p', featured ? 'FEATURED BARANGAY ANNOUNCEMENT' : 'YOUR BARANGAY. YOUR COMMUNITY.', { class: 'eyebrow' }));
  const serviceFirst = design.preset === 'public-service';
  copy.append(el('h1', serviceFirst ? 'What can we help you with?' : featured?.title || settings.hero_title || `Welcome to Barangay ${settings.barangay_name || 'Website'}`), el('p', featured?.excerpt || settings.hero_text || 'Access barangay services, read the latest advisories, and stay connected with your local government.'));
  if (serviceFirst && moduleVisible(visibility, 'services')) {
    const search = el('form', '', { class: 'service-search', role: 'search' });
    search.append(el('label', 'Find a service', { for: 'service-query', class: 'sr-only' }), el('input', '', { id: 'service-query', name: 'q', placeholder: 'Search service names…', maxlength: 100, type: 'search' }), el('button', 'Find a service', { class: 'primary', type: 'submit' }));
    search.addEventListener('submit', event => { event.preventDefault(); location.hash = `services?q=${encodeURIComponent(search.elements.q.value.trim())}`; });
    copy.append(search);
  } else {
    const actions = el('div', '', { class: 'quick-links' });
    if (moduleVisible(visibility, 'services')) actions.append(el('a', 'Explore services →', { class: 'button primary', href: '#services' }));
    if (moduleVisible(visibility, 'announcements')) actions.append(el('a', 'Latest announcements', { class: 'button', href: '#announcements' }));
    if (actions.children.length) copy.append(actions);
  }
  const desk = el('aside', '', { class: 'resident-desk', 'aria-label': 'Resident quick actions' });
  desk.append(el('p', 'RESIDENT QUICK LINKS', { class: 'eyebrow' }));
  [['services', 'Barangay services'], ['forms', 'Downloadable forms'], ['directory_entries', 'Contact your barangay']].filter(([key]) => moduleVisible(visibility, key)).forEach(([key, title]) => desk.append(el('a', `${title} ↗`, { href: `#${key}` })));
  if (moduleVisible(visibility, 'verify')) desk.append(el('a', 'Verify barangay ID ↗', { href: 'verify.html' }));
  if (moduleVisible(visibility, 'hero')) {
    hero.append(copy);
    if (desk.querySelector('a')) hero.append(desk); else hero.classList.add('hero-single');
    main.append(hero);
  }
  const sections = el('div', '', { class: 'section-grid' });
  for (const table of PRESETS[design.preset].sectionOrder) {
    if (!moduleVisible(visibility, table)) continue;
    const rows = content[table] || [];
    // Empty Home modules collapse automatically; their full routes remain available
    // and reappear here as soon as a record is published.
    if (!rows.length && !errors[table]) continue;
    const [eyebrow, title] = SECTIONS[table];
    const section = el('section', '', { class: 'public-section', 'data-section': table });
    const heading = el('div', '', { class: 'section-heading' });
    const caption = el('div'); caption.append(el('p', eyebrow, { class: 'eyebrow' }), el('h2', title));
    heading.append(caption, el('a', 'View all ↗', { href: `#${table}` })); section.append(heading);
    if (rows.length) { const cards = el('div', '', { class: 'cards' }); rows.slice(0, 3).forEach(row => cards.append(contentCard(table, row))); section.append(cards); }
    else section.append(el('p', 'This section could not be loaded. Please try again.', { class: 'empty' }));
    sections.append(section);
  }
  main.append(sections); root.append(main, publicFooter(settings, { preview, visibility })); return root;
}
