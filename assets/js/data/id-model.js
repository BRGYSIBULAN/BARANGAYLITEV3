/**
 * Purpose: shared ID date/status rules and permanent printed verification links.
 * Depends on: real record fields and the configured production website; no DOM or database.
 * Debug: UTC mirrors the existing database current_date; the printed expiry date is inclusive.
 */
import { extractQrToken } from './verification.js?v=96b812c63105';
export const PUBLIC_SITE = 'https://brgysibulan.github.io/BARANGAYLITEV3/';
export function verificationDate(now = new Date()) { return now.toISOString().slice(0, 10); }
export function idStatus(record, today = verificationDate()) {
  const raw = String(record.status || '').toUpperCase();
  if (raw === 'EXPIRED') return 'Expired';
  if (raw !== 'ACTIVE') return 'Inactive';
  if (record.expiration_date && record.expiration_date < today) return 'Expired';
  return 'Valid';
}
export function fullName(row) { return row.full_name || [row.first_name, row.middle_name, row.last_name].filter(Boolean).join(' ') || 'Name not recorded'; }
/** Never print localhost, personal details, or a regenerated token into an ID QR. */
export function verificationUrl(token) {
  const valid = extractQrToken(token); if (!valid || valid !== token) throw new Error('This record has no valid QR token.');
  const url = new URL('verify.html', PUBLIC_SITE); url.searchParams.set('qr', valid); return url.href;
}
