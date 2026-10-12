# Supabase security review — 2026-10-12

This is a read-only review of the live BRGYWEB-LITE Supabase project. No function, grant, policy, account, record, bucket, secret, or deployed website file was changed during this review.

## Review result

The 14 Supabase advisor warnings reviewed here are caused by callable `SECURITY DEFINER` functions. A warning is not automatically a vulnerability: these functions intentionally perform narrowly controlled work that the caller cannot perform directly. Their bodies, grants, input validation, internal authorization checks, browser callers, and related RLS boundaries were reviewed individually.

No confirmed privilege-escalation path was found in the reviewed function bodies. The functions must not be bulk-revoked or converted because doing so would break public directory loading, application eligibility, analytics, or authenticated staff operations.

This result does not mean the system is risk-free. The two public endpoints described below have residual abuse or privacy risks, and leaked-password protection remains disabled.

## Anonymous-callable functions

| Function | Intended behavior and current controls | Residual risk | Recommendation |
| --- | --- | --- | --- |
| `can_apply_content_admin(candidate_name)` | Returns one boolean after normalizing a submitted name and checking a private helper. It does not return the matching resident record. Direct anonymous access to `private` and `verification_records` is not granted. | A caller can repeatedly try names and learn whether a matching eligible name exists. This is a privacy/enumeration risk even though record fields are not exposed. | Keep temporarily because the application workflow depends on it. Consider moving eligibility behind a rate-limited server flow or redesigning the application response so it reveals less information. |
| `list_public_directory_records(...)` | Returns only the explicitly published public-directory fields. Sections are allowlisted, pagination is bounded, and only active, published records are included. ID numbers, QR tokens, acquisition/expiration dates, and private resident fields are not returned. | Normal public-directory scraping remains possible because the information is intentionally public. | Keep unchanged. The function is appropriately narrow for its public purpose. |
| `record_public_metric(metric_key)` | Accepts only 20 allowlisted metric keys and increments a daily aggregate. It stores no visitor identity, and anonymous users cannot read or write the metrics table directly. | Automated traffic can inflate the counters or generate unnecessary database writes. These numbers are approximate and must not be used for security, billing, or legal decisions. | Keep for current lightweight analytics. If abuse becomes material, add a separately tested rate limit, write cap, or server-side collection layer. |

## Signed-in callable functions

The signed-in warnings were reviewed as follows:

- `delete_public_metrics` and `delete_staff_activity_logs` perform their own active System Admin check, validate the requested range or scope, and record the cleanup action.
- `record_staff_activity` requires an active staff profile and restricts action names, module names, summary length, and metadata shape.
- `staff_list_directory_headings`, `staff_list_directory_records`, and `staff_save_directory_record` require an active Admin or Content Editor. Directory management is an ordinary staff content feature in the current role model, not a temporarily delegated System Admin module.
- `staff_update_design_namespace` maps each editable design namespace to an exact delegated permission, limits the changed namespace, validates object input, and uses optimistic concurrency.
- `staff_update_site_settings` requires the `page_settings` permission and validates the allowed fields, types, required values, and lengths.
- The three public functions listed above also appear in the signed-in advisor because signed-in users have explicit execute grants.

The explicit role checks inside the mutation functions are important because `SECURITY DEFINER` runs with the function owner's database privileges. Those checks must remain fail-closed and covered by tests whenever a function is edited.

## Grants and search paths

- The reviewed functions revoke execution from the broad PostgreSQL `PUBLIC` role and grant only the application roles that need them.
- Anonymous users have no direct `USAGE` on the `private` schema, no direct `SELECT` on `verification_records`, and no direct read/write access to `public_daily_metrics`.
- The directory RPCs use an empty fixed search path and fully qualified object names, which is the strongest pattern used in this project.
- Some older functions use the fixed path `public, private, pg_temp`. Their reviewed queries use qualified objects or controlled helpers, so no exploitable object-resolution path was identified. Converting them to an empty search path can be considered as a separate migration, followed by complete RPC and role testing.

## Platform follow-ups

1. Leaked-password protection is still disabled. The live organization is on the Free plan, while Supabase currently makes this setting available only on Pro and higher plans. Do not upgrade a paid plan without explicit owner approval of the recurring cost; after an approved upgrade, enable the setting and re-run Auth/login verification.
2. Supabase announced that existing projects will require explicit Data API table exposure beginning 2026-10-30. The current grant inventory and least-privilege target are documented in `docs/DATA-API-GRANTS-AUDIT-2026-10-12.md`; re-test every public and staff request after any grant change and after platform enforcement.
3. Do not treat RLS and Data API grants as substitutes for each other. Both layers must remain correct.
4. Apply at most one security hardening change at a time on a separate branch, preserve a rollback point, and run the automated and manual role checks before deployment.

## Official references

- [Supabase advisor 0028: anonymous `SECURITY DEFINER` function executable](https://supabase.com/docs/guides/observability/advisors?queryGroups=lint&lint=0028_anon_security_definer_function_executable)
- [Supabase advisor 0029: authenticated `SECURITY DEFINER` function executable](https://supabase.com/docs/guides/observability/advisors?queryGroups=lint&lint=0029_authenticated_security_definer_function_executable)
- [Data API explicit table exposure change](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)

