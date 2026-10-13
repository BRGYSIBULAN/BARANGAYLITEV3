# BRGYWEBLITEV3 continuation notes

Last verified: 2026-10-13 (Asia/Manila)

Use this file as the starting point for the next work session. Re-check live state before making changes because the website is already deployed and in use.

## Owner requirements that must remain true

- Keep the existing System Admin account, Supabase project, user accounts, records, IDs, QR tokens, RPCs, and Storage buckets.
- System Admin and Content Admin must keep different permissions and workspace content.
- The public website content is edited from the authenticated staff workspace.
- ID verification supports ID number plus last name, QR scanning, permanent QR links, and downloadable QR images.
- Page Settings includes a real maintenance mode. Maintenance blocks public content and verification but keeps staff recovery/login available.
- Design Studio controls public colors, typography, and the five layout presets. Saved designs must not flash an older/default layout during reload.
- Homepage covers support up to five compressed images.
- Keep the application lightweight and avoid unrelated JavaScript, legacy CSS injection, unnecessary libraries, and large uploaded media.
- The authored interface is English. Existing stored barangay content is not automatically translated.
- New or changed code needs clear purpose, dependency, debugging, authorization, validation, and error-handling comments as required by `AGENTS.md`.
- Never expose passwords, private resident records, session tokens, service-role/secret keys, or privileged connection strings in the browser, repository, comments, logs, or chat.

## Technology and deployment

- Static HTML, centralized CSS, and native JavaScript modules.
- GitHub Pages repository: `Brgysibulan/BARANGAYLITEV3`.
- Supabase project: `BRGYWEB-LITE` (`pkvorwvkqjnbgktkgjhr`), region `ap-southeast-1`.
- Supabase provides PostgreSQL, Auth, Storage, RPCs, and Edge Functions.
- Browser SDK is pinned to `@supabase/supabase-js@2.112.4`.
- Node.js is used only for local checks, tests, the development server, and read-only live verification.

## Verified system state

- Supabase status at backup time: `ACTIVE_HEALTHY`.
- Database engine: PostgreSQL 17, platform version `17.6.1.166`.
- Public tables: 17, all observed with RLS enabled.
- Auth accounts: 3 total; current role model has 1 System Admin and 2 Content Admin users. Do not include their private details in documentation.
- Storage buckets: `branding-media`, `disclosure-documents`, `forms`, and `gallery-media`.
- Deployed Edge Functions: `manage-editors` v7, closed `bootstrap-admin` v2, and `system-health` v2.
- Migration history recorded through `20261013053709_restrict_authenticated_direct_settings_writes` (25 migrations).
- Verification on 2026-10-13 passed 147 tests and checked 118 files.
- `npm run verify:deployment` is the authoritative read-only deployment check. It compares all 70 deployed HTML and `assets/` files with the current live Git commit byte-for-byte.
- The read-only live verifier passes the existing Supabase column contracts, published-content boundaries, private-table denials, public Directory output, staff Directory denial, and pinned SDK availability. No live write was performed.

## Recovery backup

The verified private backup is outside the public Git repository:

`../_private-backups/BRGYWEBLITEV3-backup-2026-10-13/`

It contains:

- the exact live GitHub mirror and live `main` ZIP;
- the local Git bundle and local source ZIP;
- schema, columns, constraints, indexes, RLS policies, grants, functions, triggers, views, extensions, and migrations;
- 17 public-table data snapshots containing 304 rows at backup time;
- selected Auth account/identity recovery records, excluding active session/token tables;
- all 24 Storage objects (2,952,860 bytes at backup time);
- all three deployed Edge Function sources and metadata;
- security/performance advisor reports and SHA-256 checksums.

The backup verification report has zero failures. Windows permissions restrict the folder to the current Windows account and SYSTEM. It is not stored in GitHub.

The package does not contain a native `supabase db dump`. That optional additional backup needs the database password entered locally with the Supabase CLI/Docker workflow. Never paste or save that password in chat or the repository. Active sessions, refresh tokens, one-time tokens, MFA recovery material, API secrets, and Edge Function environment secrets were intentionally excluded.

## Current Git state

- The 2026-10-12 reconciliation safely fast-forwarded local `main` by 40 commits from `1774547` to the then-live `ba5c259`; no divergent history or reset was involved.
- Security hardening and the corrected personnel photo viewer were subsequently deployed to GitHub Pages. Re-run `git fetch origin` and `npm run verify:deployment` instead of relying on a copied commit hash.
- The earlier 2026-10-12 backup remains untouched. The refreshed 2026-10-13 backup preserves the current Git history, source, database inventory, recovery data, Storage objects, and Edge Functions.
- Commit `577fe26` records the deployed anonymous-grant hardening and its verification files.
- The personnel photo viewer now exposes its active photo group for presentation only. Personnel images are capped to a comfortable desktop width without changing the uploaded photo, Gallery sizing, navigation, or Supabase data.
- Browser CSS, entry modules, nested modules, and dynamic imports share a content-derived 12-character release token. Run `npm run version:assets` after asset changes; `npm run check` fails closed if any token is stale or missing.
- Public manual ID verification, QR verification, Content Admin eligibility, and approximate analytics now use fixed server-side per-IP rate limits. The counter table is private, RLS-enabled, unavailable to browser roles, and stores only SHA-256 IP fingerprints. Existing RPC signatures and every distributed QR remain unchanged.

## Current security follow-up

No security fixes were deployed during the backup itself. The latest post-rate-limit Supabase advisors reported:

- leaked-password protection is disabled; the live organization was confirmed on 2026-10-12 to use the Free plan, while Supabase currently provides this setting only on Pro and higher plans;
- four anonymous-callable `SECURITY DEFINER` RPC warnings (`can_apply_content_admin`, `enforce_public_rate_limit`, `list_public_directory_records`, and `record_public_metric`);
- twelve signed-in-callable `SECURITY DEFINER` RPC warnings, including the constrained rate-limit helper and staff mutation/cleanup functions;
- one informational “RLS enabled without a policy” notice for the private rate-limit table; this is the intended deny-all table boundary because only its fixed helper may access the counters;
- one foreign key without a covering index, several unused-index notices, and multiple-permissive-policy performance notices.

Do not bulk-revoke or convert these functions. Some are intentional public/staff APIs. Review each function body, internal role checks, grants, callers, and tests before changing it. Administrative mutation RPCs must fail closed when the caller is not the active System Admin.

The function review is recorded in `docs/SECURITY-REVIEW-2026-10-12.md`. No confirmed privilege-escalation path was found in the reviewed bodies. Per-IP rate limiting now reduces eligibility-name enumeration, verification flooding, and metric inflation. Distributed clients can still rotate IP addresses, so the control is defense in depth rather than a guarantee against every bot.

Supabase has announced that Data API table exposure will require explicit opt-in for all projects starting 2026-10-30. Before that date, inventory the grants required by the existing application and verify each public and authenticated request after any grant change. RLS and Data API grants are separate controls.

The live, read-only grant inventory is recorded in `docs/DATA-API-GRANTS-AUDIT-2026-10-12.md`. `profiles` and `site_settings` now grant authenticated users `SELECT` only; protected Edge Function/RPC paths retain their required writes. Some legacy authenticated privileges remain on `officials` and `directory_entries` pending manual role testing. Future `postgres`-owned public objects use explicit opt-in grants.

## Recommended next sequence

1. **Completed:** compare and reconcile the live GitHub branch with the former local recovery state without overwriting either recovery copy.
2. **Completed on 2026-10-13:** all 70 deployed HTML and `assets/` files matched the current live Git commit byte-for-byte using `npm run verify:deployment`.
3. Optionally create the native Supabase SQL dump through a secure local password prompt.
4. **Completed:** reviewed the original three anonymous `SECURITY DEFINER` RPCs plus the constrained rate-limit helper against their intended public behavior and documented the residual risks.
5. **Completed:** reviewed all twelve signed-in advisor warnings for internal role checks, allowlists, narrow output, grants, and callers.
6. **Plan-blocked:** leaked-password protection cannot be enabled on the current Free plan. Upgrade to Pro only after the owner explicitly approves the recurring cost; then enable and re-run Auth/login verification.
7. **Completed:** audited current explicit Data API grants and documented the least-privilege target before the 2026-10-30 platform enforcement; no live grants were changed.
8. **Completed and deployed:** `20261012091925_restrict_anonymous_table_writes.sql` removes anonymous writes from public read-only tables and removes all anonymous `profiles` access while preserving public reads and the separate application INSERT flow. Its contract test is `tests/anonymous-grants.test.js`. Live grant inspection and `npm run verify:live` passed after deployment.
9. **Completed:** automatic cache versioning covers the full local CSS/JavaScript module graph; `npm run check` prevents a release with stale asset tokens.
10. **Completed:** server-side IP rate limiting protects manual/QR verification, Content Admin eligibility, and public analytics without replacing URLs, IDs, accounts, data, or QR tokens.
11. Run `npm test`, `npm run check`, `npm run verify:deployment`, Supabase advisors, and `npm run verify:live` after each relevant change.
12. Test authenticated writes and uploads manually with the correct role before production deployment; automated tests intentionally do not make those live writes.
13. **Completed and deployed:** future `postgres`-owned public tables, functions, and sequences no longer inherit automatic Data API access. Existing objects and their current grants were unchanged, and the post-migration live verifier passed.
14. **Completed and deployed:** authenticated direct writes were removed from `profiles` and `site_settings`; required reads, service-role profile management, and protected settings RPCs remain available.

## Where to continue debugging

- General module and request-flow map: `docs/DEBUGGING.md`
- Supabase function security review: `docs/SECURITY-REVIEW-2026-10-12.md`
- Supabase Data API grants audit: `docs/DATA-API-GRANTS-AUDIT-2026-10-12.md`
- Design behavior and safe publishing: `docs/DESIGN-STUDIO.md`
- Staff acceptance checks: `docs/STAFF-QA.md`
- Original rewire boundaries: `docs/REWIRE-AUDIT.md`
- Current backup result and limitations: `../_private-backups/BRGYWEBLITEV3-backup-2026-10-13/SUMMARY.md`
- Earlier preserved backup: `../_private-backups/BRGYWEBLITEV3-backup-2026-10-12/`

