/**
 * Purpose: record privacy-safe public counters and show/delete auditable staff activity ranges.
 * Depends on: activity RLS plus record/delete RPCs; it never stores public visitor identities.
 * Debug: check the metric allowlist, selected Manila period, then RPC/table permissions.
 */
import { unwrap } from '../core/client.js?v=96b812c63105';

export const ACTIVITY_PERIODS = Object.freeze([
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'annual', label: 'Annual' },
]);
const PERIOD_KEYS = new Set(ACTIVITY_PERIODS.map(item => item.key));
const STAFF_SCOPES = new Set(['content_admin', 'system_admin']);
const PUBLIC_METRICS = new Set([
  'page.home', 'page.announcements', 'page.services', 'page.appointment', 'page.forms', 'page.contact', 'page.pages',
  'page.officials', 'page.staff', 'page.functionaries', 'page.disclosures', 'page.gallery_items', 'page.directory_entries', 'page.verify',
  'download.forms', 'download.disclosures', 'verify.manual.match', 'verify.manual.no_match', 'verify.qr.match', 'verify.qr.no_match',
]);

/** Calendar windows use the barangay's UTC+8 day, not the viewer's device timezone. */
export function activityRange(period = 'daily', now = new Date()) {
  if (!PERIOD_KEYS.has(period)) throw new Error('Unsupported activity period.');
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Manila', year: 'numeric', month: 'numeric', day: 'numeric' })
    .formatToParts(now).filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
  let year = parts.year, month = parts.month - 1, day = parts.day;
  if (period === 'weekly') day -= 6;
  if (period === 'monthly') day = 1;
  if (period === 'annual') { month = 0; day = 1; }
  // Asia/Manila has no daylight-saving transition; subtract eight hours from local midnight.
  const from = new Date(Date.UTC(year, month, day) - 8 * 60 * 60 * 1000);
  const to = new Date(now.getTime() + 1000);
  return { from: from.toISOString(), to: to.toISOString(), fromDate: from.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }), toDate: to.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }) };
}

export function createActivity(client, auth) {
  /** Failed counters never block a public page; callers intentionally do not await this method. */
  async function recordPublic(key) {
    if (!PUBLIC_METRICS.has(key)) return false;
    const result = await client.rpc('record_public_metric', { p_metric_key: key });
    if (result.error) return false;
    return result.data === true;
  }

  async function recordStaff(action, module, summary = '') {
    await auth.requireStaff();
    if (!['auth.login', 'auth.logout', 'report.export'].includes(action)) throw new Error('Unsupported staff activity.');
    return unwrap(await client.rpc('record_staff_activity', { p_action: action, p_module: module, p_summary: summary, p_metadata: {} }));
  }

  async function staff(scope, period = 'daily', { page = 0, pageSize = 100 } = {}) {
    await auth.requireStaff(['admin']);
    if (!STAFF_SCOPES.has(scope) || !Number.isInteger(page) || page < 0 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 200) throw new Error('Invalid activity query.');
    const range = activityRange(period);
    const result = await client.from('staff_activity_logs')
      .select('id,occurred_at,actor_role,actor_name,scope,action,module,record_id,summary', { count: 'exact' })
      .eq('scope', scope).gte('occurred_at', range.from).lt('occurred_at', range.to)
      .order('occurred_at', { ascending: false }).range(page * pageSize, (page + 1) * pageSize - 1);
    return { rows: unwrap(result) || [], count: result.count ?? 0, range };
  }

  async function publicMetrics(period = 'daily') {
    await auth.requireStaff(['admin']);
    const range = activityRange(period);
    const result = await client.from('public_daily_metrics')
      .select('metric_date,metric_key,event_count,updated_at')
      .gte('metric_date', range.fromDate).lte('metric_date', range.toDate)
      .order('metric_date', { ascending: false }).order('metric_key').range(0, 4999);
    return { rows: unwrap(result) || [], range };
  }

  async function deletions() {
    await auth.requireStaff(['admin']);
    return unwrap(await client.from('activity_log_deletions')
      .select('id,occurred_at,target_scope,period_from,period_to,deleted_count,note')
      .order('occurred_at', { ascending: false }).range(0, 49)) || [];
  }

  async function deleteStaff(scope, period) {
    await auth.requireStaff(['admin']);
    if (!STAFF_SCOPES.has(scope)) throw new Error('Invalid staff activity category.');
    const range = activityRange(period);
    return Number(unwrap(await client.rpc('delete_staff_activity_logs', { p_scope: scope, p_from: range.from, p_to: range.to }))) || 0;
  }

  async function deletePublic(period) {
    await auth.requireStaff(['admin']);
    const range = activityRange(period);
    // The RPC treats p_to as exclusive, so include the current Manila date with the next day.
    const end = new Date(range.toDate + 'T00:00:00+08:00'); end.setDate(end.getDate() + 1);
    return Number(unwrap(await client.rpc('delete_public_metrics', { p_from: range.fromDate, p_to: end.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }) }))) || 0;
  }

  return Object.freeze({ recordPublic, recordStaff, staff, publicMetrics, deletions, deleteStaff, deletePublic });
}
