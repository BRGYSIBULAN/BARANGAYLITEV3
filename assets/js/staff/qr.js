/**
 * Purpose: preview/download standard printable QR codes for existing ID tokens.
 * Depends on: local pinned QR generator, Canvas and the permanent verification URL model.
 * Debug: the generated QR encodes only the HTTPS URL/token; no data goes to external QR services.
 */
import { element as el } from '../core/dom.js?v=96b812c63105';
import { verificationUrl } from '../data/id-model.js?v=96b812c63105';
import { button } from './ui.js?v=96b812c63105';
let generator;
/** Load the non-module vendor once, only when staff opens a QR preview. */
function loadGenerator() {
  if (globalThis.qrcode) return Promise.resolve(globalThis.qrcode);
  if (!generator) generator = new Promise((resolve, reject) => {
    const script = el('script', '', { src: new URL('../../vendor/qrcode-generator.js', import.meta.url).href });
    script.onload = () => globalThis.qrcode ? resolve(globalThis.qrcode) : reject(new Error('QR generator did not initialize.'));
    script.onerror = () => { generator = null; script.remove(); reject(new Error('QR generator unavailable. Try again.')); }; document.head.append(script);
  });
  return generator;
}
/** Integer-sized modules and a four-module quiet zone preserve scan reliability in print. */
export function drawQr(canvas, qr) {
  const modules = qr.getModuleCount(), scale = 10, margin = 4 * scale;
  const side = (modules + 8) * scale;
  canvas.width = side; canvas.height = side;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000';
  for (let y = 0; y < modules; y++) for (let x = 0; x < modules; x++) if (qr.isDark(y, x)) ctx.fillRect(margin + x * scale, margin + y * scale, scale, scale);
}
/** Close invalidates late download completion and revokes the temporary PNG URL. */
export async function showQr(record, { isCurrent = () => true } = {}) {
  const url = verificationUrl(record.qr_token); const qrcode = await loadGenerator();
  if (!isCurrent()) return () => {};
  const qr = qrcode(0, 'M'); qr.addData(url, 'Byte'); qr.make();
  const dialog = el('dialog', '', { class: 'qr-dialog', 'aria-label': 'ID verification QR code' });
  const canvas = el('canvas', '', { role: 'img', 'aria-label': `Verification QR for ID ${record.control_number}` }); drawQr(canvas, qr);
  let blobUrl, closed = false;
  const close = () => { closed = true; dialog.close(); dialog.remove(); if (blobUrl) URL.revokeObjectURL(blobUrl); };
  const download = button('Download PNG', async () => {
    download.disabled = true;
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (closed) return;
    if (blob) { if (blobUrl) URL.revokeObjectURL(blobUrl); blobUrl = URL.createObjectURL(blob); const link = el('a', '', { href: blobUrl, download: 'Barangay-ID-' + String(record.control_number).replace(/[^a-z0-9-]/gi, '_') + '.png' }); document.body.append(link); link.click(); link.remove(); }
    download.disabled = false;
  }, true);
  const actions = el('div', '', { class: 'cluster' }); actions.append(button('Close', close), download);
  dialog.append(el('h2', 'ID verification QR'), el('p', 'Scan with a phone camera or QR reader. Internet is required to check the current record.', { class: 'muted' }), canvas, el('a', 'Open verification page ↗', { href: url, target: '_blank', rel: 'noopener noreferrer' }), el('p', 'The token is unchanged. Print without cropping the white border.', { class: 'compact muted' }), actions);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); }); document.body.append(dialog); dialog.showModal(); return close;
}
