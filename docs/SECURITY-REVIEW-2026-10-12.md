# Supabase security review — 2026-10-12

This is a read-only review of the live BRGYWEB-LITE Supabase project. No function, grant, policy, account, record, bucket, secret, or deployed website file was changed during this review.

## Review result

The 14 Supabase advisor warnings reviewed here are caused by callable `SECURITY DEFINER` functions. A warning is not automatically a vulnerability: these functions intentionally perform narrowly controlled work that the caller cannot perform directly. Their bodies, grants, input validation, internal authorization checks, browser callers, and related RLS boundaries were reviewed individually.

No confirmed privilege-escalation path was found in the reviewed function bodies. The functions must not be bulk-revoked or converted because doing so would break public directory loading, application eligibility, analytics, or authenticated staff operations.

This result does not mean the system is risk-free. The public endpoints described below still have residual distributed-abuse risks, and leaked-password protection remains disabled.

## Deployed rate-limit follow-up

Migrations `20261012114504_public_rate_limiting.sql` and `20261012114649_harden_rate_limit_fingerprint.sql` now rate-limit the existing public RPCs without changing their names, arguments, returned fields, ID rows, or QR tokens. The limiter uses Supabase/PostgREST's documented `x-forwarded-for` client IP, stores only its SHA-256 fingerprint, keeps counters in the non-exposed `private` schema with RLS and no client table grants, and returns HTTP 429 with `Retry-After` after the fixed allowance.

Current fixed windows are: manual ID verification 15 per 10 minutes, QR verification 120 per 10 minutes, Content Admin eligibility 8 per hour, and public metrics 300 per 10 minutes. Service/management verification bypasses the public limiter so recovery checks remain available. Counter rows are opportunistically removed after two inactive days.

The new `enforce_public_rate_limit` advisor warning is intentional: the helper is `SECURITY DEFINER` because anonymous callers have no access to the private counter table. Its endpoint argument is allowlisted and owns the limit/window; callers cannot request a larger allowance, access stored fingerprints, or skip the helper inside the four protected RPCs. Calling the helper directly only spends the caller's own IP allowance.

Rate limiting is defense in depth, not an absolute bot barrier. A distributed attacker can rotate IP addresses, and many legitimate users behind one public IP share an allowance. Thresholds therefore protect guessing and database load while leaving QR scanning considerably more capacity than manual search.

## Anonymous-callable functions

| Function | Intended behavior and current controls | Residual risk | Recommendation |
| --- | --- | --- | --- |
| `can_apply_content_admin(candidate_name)` | Returns one boolean after normalizing a submitted name and checking a private helper. It does not return the matching resident record. Direct anonymous access to `private` and `verification_records` is not granted. Requests are limited to 8 per IP per hour. | Distributed callers can rotate IPs and still test names. This is a reduced, not eliminated, privacy/enumeration risk. | Keep the rate limit and generic public errors. Consider a non-enumerating approval workflow only as a separate product change. |
| `list_public_directory_records(...)` | Returns only the explicitly published public-directory fields. Sections are allowlisted, pagination is bounded, and only active, published records are included. ID numbers, QR tokens, acquisition/expiration dates, and private resident fields are not returned. | Normal public-directory scraping remains possible because the information is intentionally public. | Keep unchanged. The function is appropriately narrow for its public purpose. |
| `record_public_metric(metric_key)` | Accepts only 20 allowlisted metric keys and increments a daily aggregate. It stores no visitor identity, and anonymous users cannot read or write the metrics table directly. Requests are limited to 300 per IP per 10 minutes. | Distributed traffic can still inflate the counters. These numbers remain approximate and must not be used for security, billing, or legal decisions. | Keep the rate limit and continue treating the metrics as approximate. |

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

