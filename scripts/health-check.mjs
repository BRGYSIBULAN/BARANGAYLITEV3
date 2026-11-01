/**
 * Purpose: make a small read-only database health check independently of website visitors.
 * Depends on: Node 20+, existing public config, and optional ntfy GitHub secrets.
 * Debug: inspect the Database health workflow summary; response bodies and keys are never logged.
 */
import { appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../assets/js/core/config.js';

/** Query the real database, not a static page or Auth health endpoint. No records are written. */
export async function checkDatabase(fetcher = fetch) {
  const response = await fetcher(`${SUPABASE_URL}/rest/v1/site_settings?select=id&id=eq.1&limit=1`, {
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'Cache-Control': 'no-cache' },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`Database HTTP ${response.status}`);
  const rows = await response.json();
  // HTTP 200 alone can hide an RLS/contract issue; the existing public singleton must be readable.
  if (!Array.isArray(rows) || rows.length !== 1 || rows[0].id !== 1) {
    throw new Error('Database settings singleton was not readable');
  }
}

/** Publish only operational status; never send private records, API keys, or response bodies. */
export async function notify(message, { topic, token, fetcher = fetch } = {}) {
  if (!topic) return false;
  // Fix the destination host and reject paths/header characters in secrets before transmission.
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(topic)) throw new Error('Invalid ntfy topic configuration');
  const headers = { Title: 'Barangay Sibulan website', Priority: 'high', 'Content-Type': 'text/plain; charset=utf-8' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetcher(`https://ntfy.sh/${topic}`, {
    method: 'POST', headers, body: message, redirect: 'error', signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Notification HTTP ${response.status}`);
  return true;
}

/** Bounded retries reduce transient alerts; a failed final read keeps the workflow red. */
export async function main() {
  let failed = true, detail = 'Database request failed';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try { await checkDatabase(); failed = false; detail = 'Database settings read passed'; break; }
    catch (error) {
      // Only our own safe diagnostics are exposed, never raw server/network error objects.
      detail = /^(Database HTTP \d{3}|Database settings singleton was not readable)$/.test(error.message)
        ? error.message : 'Database request failed or timed out';
      console.log(`Attempt ${attempt}: ${detail}`);
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  console.log(`${failed ? 'FAIL' : 'PASS'}: ${detail}`);
  const summary = `## Database health\n\n${failed ? 'FAIL' : 'PASS'}: ${detail}.\n\nRead-only query of public settings; no records changed.\n`;
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
  const topic = process.env.NTFY_TOPIC, token = process.env.NTFY_TOKEN;
  if (failed || process.env.NOTIFY_TEST === 'true') {
    try {
      const sent = await notify(failed
        ? `Hindi ma-access ang barangay database. ${detail}. Tingnan ang Database health workflow at Supabase project status.`
        : 'Test alert: gumagana ang barangay database health check at phone notification.', { topic, token });
      console.log(sent ? 'Phone notification accepted by ntfy.' : 'Phone alerts not configured: add the NTFY_TOPIC repository secret.');
      // An explicit notification test must not report success when delivery is unconfigured.
      if (!sent && process.env.NOTIFY_TEST === 'true') process.exitCode = 1;
    } catch { console.error('Phone notification failed; inspect ntfy configuration.'); process.exitCode = 1; }
  }
  if (failed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
