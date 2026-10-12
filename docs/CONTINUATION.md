# BRGYWEBLITEV3 continuation notes

Last verified: 2026-10-12 (Asia/Manila)

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
- Migration history recorded through `20261012091925_restrict_anonymous_table_writes` (21 migrations after the security deployment).
- Backup-stage verification on 2026-10-12 passed 82 tests and checked 82 files. After fast-forwarding to live `main`, adding the continuation documentation, and deploying the anonymous-grant hardening, the expanded suite passes 136 tests and checks 108 files.
- The read-only deployment verifier confirms that all 70 deployed HTML and `assets/` files match live Git commit `ba5c259` byte-for-byte.
- The read-only live verifier passes the existing Supabase column contracts, published-content boundaries, private-table denials, public Directory output, staff Directory denial, and pinned SDK availability. No live write was performed.

## Recovery backup

The verified private backup is outside the public Git repository:

`../_private-backups/BRGYWEBLITEV3-backup-2026-10-12/`

It contains:

- the exact live GitHub mirror and live `main` ZIP;
- the local Git bundle and local source ZIP;
- schema, columns, constraints, indexes, RLS policies, grants, functions, triggers, views, extensions, and migrations;
- 17 public-table data snapshots containing 288 rows at backup time;
- selected Auth account/identity recovery records, excluding active session/token tables;
- all 24 Storage objects (2,952,860 bytes at backup time);
- all three deployed Edge Function sources and metadata;
- security/performance advisor reports and SHA-256 checksums.

The backup verification report has zero failures. Windows permissions restrict the folder to the current Windows account and SYSTEM. It is not stored in GitHub.

The package does not contain a native `supabase db dump`. That optional additional backup needs the database password entered locally with the Supabase CLI/Docker workflow. Never paste or save that password in chat or the repository. Active sessions, refresh tokens, one-time tokens, MFA recovery material, API secrets, and Edge Function environment secrets were intentionally excluded.

## Current Git state

- Live GitHub `main`: `ba5c259156941d4af65808969f17a6cd8789700c`.
- Local `main` was safely fast-forwarded by 40 commits from `1774547` to the same live commit on 2026-10-12.
- The former local commit was confirmed as a direct ancestor of live `main`; no divergent code history or reset was involved.
- `origin/main`, local `main`, and the verified live backup mirror now identify the same commit.
- The private backup still preserves both the earlier local state and the live GitHub state.
- The current uncommitted work contains documentation plus the read-only deployment verifier (`scripts/verify-deployment.mjs` and its package command). Review this exact diff before any future commit or deployment.

## Current security follow-up

No security fixes were deployed during the backup. The latest recorded Supabase advisors reported:

- leaked-password protection is disabled; the live organization was confirmed on 2026-10-12 to use the Free plan, while Supabase currently provides this setting only on Pro and higher plans;
- three anonymous-callable `SECURITY DEFINER` RPC warnings (`can_apply_content_admin`, `list_public_directory_records`, and `record_public_metric`);
- eleven signed-in-callable `SECURITY DEFINER` RPC warnings, including staff mutation/cleanup functions;
- one foreign key without a covering index, several unused-index notices, and multiple-permissive-policy performance notices.

Do not bulk-revoke or convert these functions. Some are intentional public/staff APIs. Review each function body, internal role checks, grants, callers, and tests before changing it. Administrative mutation RPCs must fail closed when the caller is not the active System Admin.

The read-only function review is now recorded in `docs/SECURITY-REVIEW-2026-10-12.md`. No confirmed privilege-escalation path was found in the reviewed bodies. The public eligibility check still has a name-enumeration risk, and the public metric endpoint can be abused to inflate approximate counters; either hardening effort should be a separate, reversible change.

Supabase has announced that Data API table exposure will require explicit opt-in for all projects starting 2026-10-30. Before that date, inventory the grants required by the existing application and verify each public and authenticated request after any grant change. RLS and Data API grants are separate controls.

The live, read-only grant inventory is now recorded in `docs/DATA-API-GRANTS-AUDIT-2026-10-12.md`. Required application grants exist today, but some anonymous and authenticated table privileges are broader than the current browser uses. RLS currently blocks unauthorized rows and operations. Narrowing grants is a planned defense-in-depth migration, not an emergency production edit.

## Recommended next sequence

1. **Completed:** compare and reconcile live GitHub `ba5c259` with the former local `1774547` without overwriting either recovery copy.
2. **Completed:** all 70 deployed HTML and `assets/` files matched Git commit `ba5c259` byte-for-byte using `npm run verify:deployment`.
3. Optionally create the native Supabase SQL dump through a secure local password prompt.
4. **Completed:** reviewed the three anonymous `SECURITY DEFINER` RPCs against their intended public behavior and documented the residual risks.
5. **Completed:** reviewed all eleven signed-in advisor warnings for internal role checks, allowlists, narrow output, grants, and callers.
6. **Plan-blocked:** leaked-password protection cannot be enabled on the current Free plan. Upgrade to Pro only after the owner explicitly approves the recurring cost; then enable and re-run Auth/login verification.
7. **Completed:** audited current explicit Data API grants and documented the least-privilege target before the 2026-10-30 platform enforcement; no live grants were changed.
8. **Completed and deployed:** `20261012091925_restrict_anonymous_table_writes.sql` removes anonymous writes from public read-only tables and removes all anonymous `profiles` access while preserving public reads and the separate application INSERT flow. Its contract test is `tests/anonymous-grants.test.js`. Live grant inspection and `npm run verify:live` passed after deployment.
9. Run `npm test`, `npm run check`, `npm run verify:deployment`, Supabase advisors, and `npm run verify:live` after each relevant change.
10. Test authenticated writes and uploads manually with the correct role before production deployment; automated tests intentionally do not make those live writes.

## Where to continue debugging

- General module and request-flow map: `docs/DEBUGGING.md`
- Supabase function security review: `docs/SECURITY-REVIEW-2026-10-12.md`
- Supabase Data API grants audit: `docs/DATA-API-GRANTS-AUDIT-2026-10-12.md`
- Design behavior and safe publishing: `docs/DESIGN-STUDIO.md`
- Staff acceptance checks: `docs/STAFF-QA.md`
- Original rewire boundaries: `docs/REWIRE-AUDIT.md`
- Backup result and limitations: `../_private-backups/BRGYWEBLITEV3-backup-2026-10-12/SUMMARY.md`

