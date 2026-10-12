/**
 * Purpose: manual and QR verification using the original BRGYWEB-LITE RPC contracts.
 * Depends on: unchanged verification services, lazy local qr-scanner and shared public design.
 * Debug: manual needs ID plus last name; camera permission is requested only after Start camera.
 * Privacy: never list records, navigate arbitrary scanned URLs, upload frames, or log tokens.
 */
import { getServices } from '../core/services.js?v=96b812c63105';
import { element as el } from '../core/dom.js?v=96b812c63105';
import { extractQrToken } from '../data/verification.js?v=96b812c63105';
import { fullName } from '../data/id-model.js?v=96b812c63105';
import { watchDesign } from '../design/runtime.js?v=96b812c63105';
import { beginDesignLoad, designFailed } from '../design/boot.js?v=96b812c63105';
import { publicHeader } from '../design/public-renderer.js?v=96b812c63105';
import { watchAvailability, maintenanceSurface } from './availability.js?v=96b812c63105';
import { defaultVisibility, moduleVisible } from '../data/visibility.js?v=96b812c63105';
import { watchVisibility, unavailableSurface } from './visibility.js?v=96b812c63105';

/** Render only the fields authorized by the existing public verification RPC. */
export function verificationResult(record) {
  const result = el('section', '', { class: 'verification-result', 'aria-label': 'Verification result' });
  if (!record) { result.append(el('h2', 'No matching ID found'), el('p', 'Check the ID number and last name, or scan the QR printed on the ID.')); return result; }
  // The original RPC has already applied its expiry rule; the viewer's clock must not override it.
  const state = record.status === 'ACTIVE' ? 'Valid' : record.status === 'EXPIRED' ? 'Expired' : 'Inactive';
  result.append(el('span', state === 'Valid' ? '✓ Valid ID' : state + ' ID', { class: `status-badge ${state === 'Valid' ? 'good' : 'warning'}` }), el('h2', fullName(record)));
  const details = el('dl', '', { class: 'id-details' });
  for (const [key, label] of [['control_number', 'ID number'], ['date_acquired', 'Date acquired'], ['expiration_date', 'Expiration date']]) { details.append(el('dt', label), el('dd', record[key] || 'Not recorded')); }
  result.append(details, el('p', 'This checks the stored ID record. Compare the result with the physical ID and its holder.', { class: 'muted compact' })); return result;
}

/** Scanner lifetime is tied to the page; hidden/closed pages release the camera immediately. */
export function mountVerification(root, service, { checkAvailability = async () => true, recordMetric = () => {} } = {}) {
  let scanner, Scanner, disposed = false, generation = 0, cameraGeneration = 0;
  const manual = el('form', '', { class: 'verification-form' });
  const number = el('input', '', { id: 'id-number', name: 'control_number', required: '', minlength: 4, maxlength: 40, pattern: '[A-Za-z0-9-]+', autocomplete: 'off', placeholder: 'Enter the printed ID number' });
  const lastName = el('input', '', { id: 'last-name', name: 'last_name', required: '', maxlength: 80, autocomplete: 'off', placeholder: 'Enter last name' });
  const submit = el('button', 'Verify ID →', { type: 'submit', class: 'primary' });
  manual.append(el('h2', 'Search by ID number'), el('p', 'Last name is required by the existing verification system.', { class: 'muted' }), el('label', 'ID number', { for: 'id-number' }), number, el('label', 'Last name', { for: 'last-name' }), lastName, submit);
  const scan = el('section', '', { class: 'scanner-panel' });
  const video = el('video', '', { muted: '', playsinline: '', hidden: '', 'aria-label': 'Live camera preview for QR scanning' });
  video.muted = true;
  const start = el('button', 'Start camera scanner', { type: 'button' }); const stop = el('button', 'Stop camera', { type: 'button', disabled: '' });
  const file = el('input', '', { type: 'file', id: 'scan-image', accept: 'image/png,image/jpeg,image/webp' });
  const scanStatus = el('p', 'Camera is off.', { role: 'status', class: 'muted compact' });
  const controls = el('div', '', { class: 'cluster' }); controls.append(start, stop);
  scan.append(el('h2', 'Or scan the ID QR'), el('p', 'Use the camera or select a QR photo. Processing happens on this device.', { class: 'muted' }), video, controls, scanStatus, el('label', 'Scan a saved QR image', { for: 'scan-image' }), file);
  const columns = el('div', '', { class: 'verify-options' }); columns.append(manual, scan);
  const result = el('div', '', { class: 'verification-output', role: 'status', 'aria-live': 'polite' }); root.append(columns, result);
  function stopCamera() { cameraGeneration++; scanner?.destroy(); scanner = undefined; video.srcObject?.getTracks().forEach(track => track.stop()); video.srcObject = null; video.hidden = true; start.disabled = false; stop.disabled = true; scanStatus.textContent = 'Camera is off.'; }
  async function getScanner() { if (!Scanner) Scanner = (await import('../../vendor/qr-scanner.min.js?v=96b812c63105')).default; return Scanner; }
  async function lookup(operation, kind) {
    if (disposed) return;
    const request = ++generation; stopCamera(); result.replaceChildren(el('p', 'Checking the existing ID record…', { class: 'notice' })); submit.disabled = true;
    try {
      // A maintenance change disposes this form before any new public lookup is sent.
      if (!await checkAvailability() || disposed || request !== generation) return;
      const record = await operation();
      if (!disposed && request === generation) {
        result.replaceChildren(verificationResult(record));
        // Only the lookup type and match/no-match outcome are counted. ID numbers,
        // names, QR tokens, and device details never enter analytics.
        Promise.resolve(recordMetric(`verify.${kind}.${record ? 'match' : 'no_match'}`)).catch(() => {});
      }
    }
    catch (error) { if (!disposed && request === generation) result.replaceChildren(el('p', 'Verification unavailable: ' + error.message, { class: 'notice' })); }
    finally { if (!disposed && request === generation) submit.disabled = false; }
  }
  function scanned(value) { const token = extractQrToken(value); if (!token) { scanStatus.textContent = 'This is not a supported barangay ID QR. Try the printed ID code.'; return; } lookup(() => service.verifyQr(token), 'qr'); }
  manual.addEventListener('submit', event => { event.preventDefault(); const control = number.value, surname = lastName.value; lookup(() => service.verifyManual(control, surname), 'manual'); });
  start.addEventListener('click', async () => {
    const attempt = ++cameraGeneration; start.disabled = true; stop.disabled = false; scanStatus.textContent = 'Starting camera…';
    try {
      if (!await checkAvailability() || disposed || attempt !== cameraGeneration) return;
      const QrScanner = await getScanner(); if (disposed || attempt !== cameraGeneration) return;
      video.hidden = false;
      scanner = new QrScanner(video, data => { if (!disposed) scanned(data.data); }, { preferredCamera: 'environment', returnDetailedScanResult: true, maxScansPerSecond: 5 });
      await scanner.start(); if (disposed || attempt !== cameraGeneration) { scanner?.destroy(); return; }
      scanStatus.textContent = 'Point your camera at the QR printed on the ID.';
    } catch { if (!disposed && attempt === cameraGeneration) { stopCamera(); scanStatus.textContent = 'Camera unavailable or permission denied. Allow camera access on HTTPS, choose a QR image, or use manual search.'; } }
  });
  stop.addEventListener('click', stopCamera);
  file.addEventListener('change', async () => {
    const image = file.files?.[0]; file.value = ''; if (!image) return;
    if (image.size > 10 * 1024 * 1024) { scanStatus.textContent = 'Choose a QR image smaller than 10 MB.'; return; }
    file.disabled = true; stopCamera(); scanStatus.textContent = 'Reading QR image on this device…';
    try { const QrScanner = await getScanner(); const code = await QrScanner.scanImage(image, { returnDetailedScanResult: true }); if (!disposed) scanned(code.data); }
    catch { if (!disposed) scanStatus.textContent = 'No readable QR found. Choose a sharper photo with the full white border.'; }
    finally { file.disabled = false; }
  });
  const visibility = () => { if (document.hidden) stopCamera(); }; document.addEventListener('visibilitychange', visibility);
  const cleanup = () => { disposed = true; generation++; stopCamera(); document.removeEventListener('visibilitychange', visibility); };
  cleanup.verifyToken = value => lookup(() => service.verifyQr(value), 'qr'); return cleanup;
}
/** Mount the live page behind availability checks; injected services are used only by tests. */
export async function startVerificationPage({ services: injectedServices } = {}) {
  beginDesignLoad();
  const root = document.querySelector('#verify-root'), status = document.querySelector('#status');
  let stopAvailability, stopVisibility, stopDesign, currentCleanup, disposed = false;
  let settings, availabilityReady = false, visibility = defaultVisibility(), visibilityReady = false, availabilityError, visibilityError;
  const cleanup = () => { disposed = true; stopAvailability?.(); stopVisibility?.(); stopDesign?.(); currentCleanup?.(); };
  window.addEventListener('pagehide', cleanup, { once: true });
  try {
    const services = injectedServices || getServices();
    const visibilityService = services.visibility || { read: async () => ({ config: defaultVisibility() }) };
    let pageRecorded = false;
    const render = () => {
      if (disposed || !availabilityReady || !visibilityReady) return;
      // Dispose stops the camera and invalidates any outstanding verification result.
      currentCleanup?.(); currentCleanup = undefined; root.replaceChildren(); status.textContent = '';
      if (!settings || settings.maintenance_mode) {
        root.append(maintenanceSurface(settings || {}, { error: availabilityError, mainId: 'verification-main', retry: () => stopAvailability.refresh() })); return;
      }
      if (!visibility || !moduleVisible(visibility, 'verify')) {
        const header = publicHeader(settings, 'verify', visibility || defaultVisibility());
        header.querySelectorAll('a[href^="#"]').forEach(link => { link.href = 'index.html' + link.getAttribute('href'); });
        root.append(header, unavailableSurface(settings, { verification: !visibilityError, error: visibilityError, mainId: 'verification-main', retry: () => stopVisibility.refresh() }));
        document.title = 'ID verification unavailable — Barangay ' + settings.barangay_name;
        return;
      }
      const header = publicHeader(settings, 'verify', visibility); header.querySelectorAll('a[href^="#"]').forEach(link => { link.href = 'index.html' + link.getAttribute('href'); }); root.append(header);
      const main = el('main', '', { id: 'verification-main', tabindex: '-1', class: 'container verify-main' }); root.append(main);
      main.append(el('p', 'BARANGAY SIBULAN · RECORD VERIFICATION', { class: 'eyebrow muted' }), el('h1', 'Verify a barangay ID'), el('p', 'Check the name, acquisition date, expiration date and current status.', { class: 'muted' }));
      if (!pageRecorded) { pageRecorded = true; services.activity?.recordPublic?.('page.verify').catch(() => {}); }
      currentCleanup = mountVerification(main, services.verification, { recordMetric: key => services.activity?.recordPublic?.(key), checkAvailability: async () => {
        const [latestSettings, latestVisibility] = await Promise.all([stopAvailability.refresh(), stopVisibility.refresh()]);
        return latestSettings?.maintenance_mode === false && latestVisibility && moduleVisible(latestVisibility, 'verify');
      } });
      const token = new URLSearchParams(location.search).get('qr'); if (token) currentCleanup.verifyToken(token);
    };
    stopAvailability = watchAvailability(services.settings, (next, error) => {
      settings = next; availabilityError = error; availabilityReady = true; render();
    });
    stopVisibility = watchVisibility(visibilityService, (next, error) => {
      visibility = next; visibilityError = error; visibilityReady = true; render();
    });
    await Promise.all([stopAvailability.refresh(), stopVisibility.refresh()]); if (disposed) return;
    stopDesign = await watchDesign(services.design); if (disposed) stopDesign();
  } catch (error) { if (!disposed) { designFailed(); status.textContent = 'Unable to load verification: ' + error.message; } }
  return cleanup;
}
if (typeof document !== 'undefined' && document.querySelector('#verify-root')) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startVerificationPage, { once: true }); else startVerificationPage();
  window.addEventListener('pageshow', event => { if (event.persisted) { document.querySelector('#verify-root').replaceChildren(); startVerificationPage(); } });
}
