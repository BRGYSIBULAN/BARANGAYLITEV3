/**
 * Purpose: retain public ID verification and protected System Admin record operations.
 * Depends on: the two existing verification RPCs and verification_records table.
 * Debug: public lookup errors belong to RPCs; admin list/save errors need role/RLS checks.
 */
import { unwrap } from '../core/client.js';
import { VERIFICATION_FIELDS, pickFields } from './contracts.js';

/** Accept an existing UUID token or printed legacy QR URL, not arbitrary query text. */
export function extractQrToken(value) {
  const pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const raw = String(value || '').trim();
  if (pattern.test(raw)) return raw;
  try {
    const token = new URL(raw).searchParams.get('qr') || '';
    return pattern.test(token) ? token : '';
  } catch { return ''; }
}

export function createVerification(client, auth) {
  /** Public manual lookup: send the exact existing RPC arguments, never list private rows. */
  async function verifyManual(control, lastName) {
    if (!control.trim() || !lastName.trim()) throw new Error('Control number and last name are required.');
    const rows = unwrap(await client.rpc('verify_barangay_record', {
      p_control_number: control.trim(), p_last_name: lastName.trim(),
    }));
    return rows?.[0] || null;
  }
  /** A valid QR uses the existing database-owned token without rotating it. */
  async function verifyQr(value) {
    const token = extractQrToken(value);
    if (!token) throw new Error('Invalid barangay QR token.');
    const rows = unwrap(await client.rpc('verify_barangay_record_qr', { p_token: token }));
    return rows?.[0] || null;
  }
  /** Private records require the exact protected permission and bounded pagination. */
  async function list({ page = 0, pageSize = 50, search = '', status = 'all' } = {}) {
    await auth.requirePermission('verification');
    if (!Number.isInteger(page) || page < 0 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new Error('Invalid pagination.');
    if (typeof search !== 'string' || search.length > 100) throw new Error('Search must be at most 100 characters.');
    if (!['all', 'ACTIVE', 'INACTIVE', 'EXPIRED'].includes(status)) throw new Error('Invalid status filter.');
    let query = client.from('verification_records').select(['id', 'qr_token', ...VERIFICATION_FIELDS].join(','), { count: 'exact' });
    // Each word may match any identity field, so first/last names work in either order.
    // Quote PostgREST values and escape LIKE wildcards to keep typed text out of filter syntax.
    for (const word of search.trim().split(/\s+/).filter(Boolean)) {
      const pattern = JSON.stringify('%' + word.replace(/[\\%_*]/g, '\\$&') + '%');
      query = query.or(['control_number', 'first_name', 'middle_name', 'last_name', 'designation']
        .map(field => `${field}.ilike.${pattern}`).join(','));
    }
    if (status !== 'all') query = query.eq('status', status);
    const result = await query.order('control_number').order('id').range(page * pageSize, (page + 1) * pageSize - 1);
    return { rows: unwrap(result) || [], count: result.count ?? 0 };
  }
  /** Update only editable ID details; the token and database ID are never in the payload. */
  async function save(values, id = null) {
    await auth.requirePermission('verification');
    // qr_token is database-owned. Editing an ID must not invalidate printed QR codes.
    const payload = pickFields(values, VERIFICATION_FIELDS);
    for (const key of ['date_acquired', 'expiration_date']) if (payload[key] && (!/^\d{4}-\d{2}-\d{2}$/.test(payload[key]) || Number.isNaN(Date.parse(payload[key])))) throw new Error('Use a valid date.');
    if ((id === null || Object.hasOwn(payload, 'control_number')) && !payload.control_number?.trim()) throw new Error('Control number is required.');
    if (payload.status && !['ACTIVE', 'INACTIVE', 'EXPIRED'].includes(payload.status)) throw new Error('Invalid status.');
    if (payload.date_acquired && payload.expiration_date && payload.expiration_date < payload.date_acquired) throw new Error('Expiration must not precede the acquisition date.');
    const query = id === null ? client.from('verification_records').insert(payload) : client.from('verification_records').update(payload).eq('id', id);
    return unwrap(await query.select(['id', 'qr_token', ...VERIFICATION_FIELDS].join(',')).single());
  }
  /** Explicit admin deletion; the UI must confirm the exact record before calling. */
  async function remove(id) {
    await auth.requirePermission('verification');
    if (id === null || id === undefined || id === '') throw new Error('Record ID required.');
    return unwrap(await client.from('verification_records').delete().eq('id', id).select('id').single());
  }
  /** Aggregate only status/dates; no resident names are downloaded for dashboard analysis. */
  async function overview() {
    await auth.requirePermission('verification');
    const { verificationDate } = await import('./id-model.js');
    const today = verificationDate();
    const soon = new Date(today + 'T00:00:00Z'); soon.setUTCDate(soon.getUTCDate() + 30);
    const count = async transform => {
      const query = client.from('verification_records').select('id', { count: 'exact', head: true });
      const result = await transform(query); if (result.error) throw result.error; return result.count;
    };
    const base = q => q.eq('status', 'ACTIVE').or(`expiration_date.is.null,expiration_date.gte.${today}`);
    const months = Array.from({ length: 6 }, (_, i) => { const start = new Date(today.slice(0, 7) + '-01T00:00:00Z'); start.setUTCMonth(start.getUTCMonth() - (5 - i)); const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1); return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), label: start.toLocaleDateString('en-PH', { month: 'short', year: '2-digit', timeZone: 'UTC' }) }; });
    const [total, valid, expired, due, monthly] = await Promise.all([
      count(q => q), count(base), count(q => q.or(`status.eq.EXPIRED,and(status.eq.ACTIVE,expiration_date.lt.${today})`)),
      count(q => base(q).gte('expiration_date', today).lte('expiration_date', soon.toISOString().slice(0, 10))),
      Promise.all(months.map(async month => ({ label: month.label, value: await count(q => q.gte('date_acquired', month.start).lt('date_acquired', month.end)) }))),
    ]);
    return { total, valid, expired, due, other: total - valid - expired, monthly };
  }
  return Object.freeze({ verifyManual, verifyQr, list, save, remove, overview });
}
