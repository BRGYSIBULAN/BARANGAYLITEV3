/**
 * Purpose: enlarge published personnel and gallery photos with accessible previous/next navigation.
 * Depends on: card images marked by public-renderer.js and the browser's native dialog element.
 * Debug: inspect data-photo-viewer/group attributes; placeholder icons are intentionally excluded.
 */

const PHOTO_SELECTOR = 'img[data-photo-viewer="true"]';

/** Install one delegated viewer so newly rendered public routes work without rebinding each card. */
export function installPhotoViewer(root) {
  if (!root) return () => {};

  const dialog = document.createElement('dialog');
  dialog.className = 'photo-viewer';
  dialog.setAttribute('aria-label', 'Personnel photo viewer');
  const frame = document.createElement('div');
  frame.className = 'photo-viewer-frame';
  const topbar = document.createElement('div');
  topbar.className = 'photo-viewer-topbar';
  const heading = document.createElement('strong');
  heading.textContent = 'Photo viewer';
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'photo-viewer-close';
  closeButton.setAttribute('aria-label', 'Close photo viewer');
  closeButton.textContent = 'Close ×';
  topbar.append(heading, closeButton);

  const stage = document.createElement('div');
  stage.className = 'photo-viewer-stage';
  const image = document.createElement('img');
  image.className = 'photo-viewer-image';
  stage.append(image);

  const controls = document.createElement('div');
  controls.className = 'photo-viewer-controls';
  const previous = document.createElement('button');
  previous.type = 'button'; previous.className = 'photo-viewer-previous'; previous.textContent = '← Previous';
  const details = document.createElement('div');
  details.className = 'photo-viewer-details';
  const caption = document.createElement('p');
  caption.className = 'photo-viewer-caption';
  const count = document.createElement('small');
  count.className = 'photo-viewer-count'; count.setAttribute('aria-live', 'polite');
  details.append(caption, count);
  const next = document.createElement('button');
  next.type = 'button'; next.className = 'photo-viewer-next'; next.textContent = 'Next →';
  controls.append(previous, details, next);
  frame.append(topbar, stage, controls); dialog.append(frame); document.body.append(dialog);

  let index = 0;
  let activeGroup = '';
  let opener;
  let touchStartX;
  // Keep gallery navigation inside the gallery instead of mixing it with personnel photos on Home.
  const photos = () => [...root.querySelectorAll(PHOTO_SELECTOR)].filter(node => (node.dataset.photoGroup || '') === activeGroup);
  const sourceUrl = node => node.currentSrc || node.getAttribute('src') || node.src;

  const render = () => {
    const items = photos();
    if (!items.length) return;
    index = ((index % items.length) + items.length) % items.length;
    const source = items[index];
    image.src = sourceUrl(source);
    image.alt = source.alt || 'Barangay personnel photo';
    caption.textContent = source.dataset.photoCaption || source.alt || 'Barangay personnel photo';
    count.textContent = `${index + 1} of ${items.length}`;
    previous.disabled = items.length < 2;
    next.disabled = items.length < 2;
  };
  const move = amount => { index += amount; render(); };
  const close = () => {
    if (dialog.hasAttribute('open')) dialog.close();
    document.body.classList.remove('photo-viewer-open');
    opener?.focus?.(); opener = undefined;
  };
  const open = source => {
    activeGroup = source.dataset.photoGroup || '';
    // Expose only the active presentation group so CSS can size personnel
    // portraits independently without changing Gallery photos or stored data.
    dialog.dataset.photoGroup = activeGroup;
    const items = photos();
    const selected = items.indexOf(source);
    if (selected < 0) return;
    index = selected; opener = source; render();
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    document.body.classList.add('photo-viewer-open');
    closeButton.focus();
  };
  const targetPhoto = event => event.target.closest?.(PHOTO_SELECTOR);
  const onRootClick = event => { const target = targetPhoto(event); if (target && root.contains(target)) open(target); };
  const onRootKeydown = event => {
    const target = targetPhoto(event);
    if (target && root.contains(target) && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); open(target); }
  };
  const onDialogKeydown = event => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); move(1); }
    else if (event.key === 'Escape') { event.preventDefault(); close(); }
  };
  const onDialogClick = event => { if (event.target === dialog) close(); };
  const onTouchStart = event => { touchStartX = event.touches?.[0]?.clientX; };
  const onTouchEnd = event => {
    const endX = event.changedTouches?.[0]?.clientX;
    if (typeof touchStartX === 'number' && typeof endX === 'number' && Math.abs(endX - touchStartX) > 50) move(endX < touchStartX ? 1 : -1);
    touchStartX = undefined;
  };

  root.addEventListener('click', onRootClick);
  root.addEventListener('keydown', onRootKeydown);
  dialog.addEventListener('keydown', onDialogKeydown);
  dialog.addEventListener('click', onDialogClick);
  stage.addEventListener('touchstart', onTouchStart, { passive: true });
  stage.addEventListener('touchend', onTouchEnd, { passive: true });
  closeButton.addEventListener('click', close);
  previous.addEventListener('click', () => move(-1));
  next.addEventListener('click', () => move(1));

  return () => {
    root.removeEventListener('click', onRootClick);
    root.removeEventListener('keydown', onRootKeydown);
    close(); dialog.remove();
  };
}
