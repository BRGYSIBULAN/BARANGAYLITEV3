# Supabase Data API grants audit — 2026-10-12

This began as a read-only inventory of the live `anon` and `authenticated` table/function grants used by BRGYWEBLITEV3. It was prepared for Supabase's announced explicit Data API exposure change. Later versioned migrations applied the documented anonymous-write reduction and public RPC rate limits; those follow-ups did not change accounts, resident records, ID numbers, or QR tokens.

## Result

- All 17 live public tables have RLS enabled.
- The additional `private.public_rate_limits` table has RLS enabled and no browser/service table grants. Its lack of an RLS policy is an intentional deny-all boundary; only the constrained rate-limit helper accesses it as owner.
- The tables and RPCs used by the current browser application already have explicit grants for their required Supabase roles.
- Existing RLS policies still decide which rows each caller may access. The live verifier confirms that anonymous callers cannot read the reviewed private tables or unpublished public content.
- Several table grants are broader than the operations made by the current browser code. RLS blocks those operations today, but narrowing the grants would add defense in depth if a policy is changed incorrectly later.
- This audit establishes the current application requirement; it does not guarantee rollout behavior. Re-run the public and authenticated checks after the Supabase platform enforcement takes effect or after any grant migration.

## Minimum table operations observed in the current browser

| Table or table group | `anon` requirement | `authenticated` requirement | Current note |
| --- | --- | --- | --- |
| `announcements`, `services`, `disclosures`, `forms`, `gallery_items`, `pages` | `SELECT` published/active rows | `SELECT`, `INSERT`, `UPDATE`, `DELETE` for active staff | Current grants support these calls; RLS limits public rows and staff writes. |
| `officials`, `directory_entries` | `SELECT` is used for the legacy/contact public content path; public personnel uses a limited RPC | `SELECT` is used by the dashboard; personnel classification writes use limited RPCs | Current grants also include direct writes that the present UI does not use. Retain until legacy/recovery behavior is manually confirmed. |
| `site_settings` | `SELECT` | `SELECT`; updates use protected RPCs | Current direct insert/update/delete grants are broader than the current client requirement. |
| `content_admin_applications` | `INSERT` | `INSERT` may be required when signup immediately creates a session | Application management runs through the `manage-editors` Edge Function. Direct select/update/delete are not used by the current browser service. |
| `profiles` | None | `SELECT` for the active staff identity | Anonymous CRUD and authenticated writes are not used by the current browser; RLS currently denies anonymous access. |
| `staff_delegated_permissions` | None | `SELECT`, `INSERT`, `UPDATE` | The UI uses upsert to preserve an auditable permission row. It does not directly delete grants. |
| `verification_records` | None | `SELECT`, `INSERT`, `UPDATE`, `DELETE` for the System Admin or an explicitly delegated active editor | RLS calls the protected permission check. Public verification uses RPCs instead of table access. |
| `verification_record_history` | None | `SELECT` for the System Admin | History writes are produced by database triggers. |
| `staff_activity_logs`, `activity_log_deletions`, `public_daily_metrics` | None | `SELECT` within their role-specific RLS policies | Writes and cleanup run through restricted RPCs. |

## RPC exposure required by the current application

- Anonymous and authenticated: `can_apply_content_admin`, `enforce_public_rate_limit`, `list_public_directory_records`, `record_public_metric`, `verify_barangay_record`, and `verify_barangay_record_qr`. Direct calls to the rate-limit helper expose no counter rows and can only spend the caller IP's fixed allowance.
- Authenticated only: `delete_public_metrics`, `delete_staff_activity_logs`, `record_staff_activity`, `staff_list_directory_headings`, `staff_list_directory_records`, `staff_save_directory_record`, `staff_update_design_namespace`, and `staff_update_site_settings`.
- The function grants already match those role groups. The separate function-body review is in `docs/SECURITY-REVIEW-2026-10-12.md`.

## Hardening candidates, not yet applied

1. Replace broad anonymous CRUD grants on public-content tables with the exact public `SELECT` grants.
2. Remove anonymous access to `profiles` at the grant layer, in addition to its current RLS denial.
3. Keep anonymous `INSERT` only on `content_admin_applications`; confirm both email-confirmation modes before changing its authenticated grant.
4. Reduce authenticated direct writes on `site_settings`, `profiles`, legacy `officials`, and `directory_entries` only after manual System Admin and Content Admin regression testing.
5. Preserve required sequence privileges if any future table insert uses an identity/sequence-backed key.
6. Apply the final grant changes as one versioned migration with a rollback script. Test anonymous pages, application signup, both staff roles, all CRUD screens, verification, QR links, uploads, and Edge Function account management before production deployment.

The current broad grants are not proof of public data exposure because RLS remains enabled and was tested. They are nevertheless a larger authorization surface than the current browser needs, so the proposed narrowing should be treated as a planned security improvement rather than an emergency live edit.

## Local hardening draft

The migration `supabase/migrations/20261012091925_restrict_anonymous_table_writes.sql` implements only the first, lowest-risk anonymous-grant reduction. It preserves public `SELECT`, the separate Content Admin application `INSERT`, all authenticated/service-role privileges, existing RLS policies, RPC grants, data, Auth, and Storage. It was applied to the live project on 2026-10-12; live grant inspection and the read-only application verifier passed afterward.

## Official reference

- [Supabase Data API explicit table exposure change](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)

