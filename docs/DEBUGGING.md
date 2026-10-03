# Troubleshooting guide

## ID record live search

`staff/content-screen.js` searches ID records after a 300 ms typing pause; Enter/Search runs immediately. Status changes and Clear filters reset to page one. Matching table rows act as live suggestions with existing View/Edit/QR actions. Help text and live result counts explain empty results. Old rows are cleared and request generations are invalidated as soon as typing changes, preventing delayed responses from showing stale actions. Cleanup cancels pending timers.

`data/verification.js` keeps the existing verification permission and RLS. Each word must match control number, first/middle/last name, or designation; word order does not matter. Values are quoted for PostgREST and LIKE wildcards are escaped. Results remain bounded and paginated across the database, rather than filtering only the current page. Public verification RPCs are unchanged. Diagnose access errors first, then the selected stored-status filter and search terms. `tests/id-search.test.js` covers protected filters, special characters, debounce, stale responses, clear, and cleanup without live records.

## Previous/default design flashes during reload

Live HTML shells and `preview.html` start with `data-design-state="loading"`. The central stylesheet hides the themed content and displays a small neutral loading notice. `design/boot.js` is dependency-free and loads before the SDK, so a missing entry script gets a retry message after 12 seconds instead of an indefinite blank page. A failed theme read does not silently reveal a guessed preset.

`design/runtime.js` applies the saved tokens, runs the layout callback, and only then calls `designReady()` in the same task. The initial read also runs in a hidden tab; subsequent background reads still skip hidden tabs and preserve the last working design on failure. Public and verification pages re-arm the gate when restored from Back/Forward cache. The preview waits for its parent's origin/source/channel-validated draft before its first render; it no longer paints Modern LGU before receiving that draft.

This changes display timing only. It does not save designs, add browser-storage caches, or change existing accounts, records, maintenance, or permissions. Preview-only drafts remain in memory; a design must be confirmed with **Publish Everywhere** in the authenticated System Admin studio to survive a reload. `tests/design-loading.test.js` covers deferred/failed theme reads, hidden tabs, recovery, real public/verification controllers, HTML gates, and the preview handshake without production requests.

## Page Settings and maintenance

The standalone `design-studio.html` and its iframe are a sample appearance preview, not live staff editing. Use **Open live Page Settings** or sign in at `login.html?next=settings`. A System Admin can always edit `admin/index.html#settings`. A Content Admin sees it only while their individual `page_settings` grant is enabled and unexpired; the protected RPC and RLS repeat that check on every save.

- `core/navigation.js` preserves only allowlisted, role-appropriate destinations after login, never arbitrary URLs.
- `staff/settings-screen.js` has separate confirmed **Enable/Disable maintenance mode**, **Edit maintenance notice**, and write-free **Preview maintenance notice** controls. A toggle updates only `maintenance_mode`; blank notice text cannot block turning maintenance off.
- `public/availability.js` reads existing settings on entry, focus/visibility, and once per minute while visible. Public navigation, pagination, and ID lookup also recheck availability. Concurrent reads are deduplicated; ordinary polls do not reload content tables.
- `public/app.js` disposes its router and carousel on maintenance or a failed availability check. Late content/theme responses cannot restore the public view. Turning maintenance off restores the current public route.
- `public/verify.js` removes verification controls, stops camera tracks, and discards pending results when availability changes. A direct QR link does not make a verification request while maintenance is on.
- Login and staff workspaces are not gated by maintenance. Back/Forward-cache restores of public pages recheck availability.

This preserves the original website-level maintenance contract. It is not a new security boundary: existing database RLS, public file links, and already-downloaded copies remain unchanged. No database schema, RPC, policy, account, or live maintenance value is changed by deployment or automated tests.

`tests/maintenance.test.js` covers real controller/form paths with fake services, including editing, confirmation, denied saves, maintenance transitions, and late-response/scanner cleanup. These tests do not prove a real authenticated save or physical camera behavior.

## Staff editing / ID / cover update

- `data/visibility.js` stores `brgyweblitev3_visibility` inside the existing `site_settings.design_theme` JSON. Every save uses the protected namespace RPC to atomically patch one module or Directory heading while preserving the design, cover slideshow, legacy keys, records, and files. A `VISIBILITY_CONFLICT` means another settings writer changed the JSON first; reload before retrying.
- `staff/visibility-screen.js` is the protected **Public visibility** screen. There is no whole-page Save: every module and every actual Directory category has its own switch and Save button. Turning off the Directory parent hides Officials, Staff, Functionaries, and Contact Directory without overwriting their individual ON/OFF preferences.
- `public/visibility.js` rechecks saved visibility on entry, focus, and once per minute. `public/app.js` removes disabled links, Home previews, quick links, footer links, map, and direct routes. Empty Home modules collapse until content is published. A disabled direct route shows an unavailable notice instead of deleting or exposing records.
- `public/verify.js` requires both normal website availability and `verify` visibility before calling either public RPC. When Verify is OFF, old printed QR links state that verification is temporarily unavailable and do not label the ID invalid.
- `staff/workspace.js` nests **Barangay Officials**, **Barangay Staff**, and **Barangay Functionaries** under one Directory heading instead of exposing a flat Directory Records module.
- `staff/content-screen.js`: ordinary content and ID Create, Read, Update, and Delete from searchable screens. `staff/directory-screen.js` separately lists existing people through `data/directory.js`; it saves only Directory category/subcategory/photo/order/publish metadata and never creates or deletes a verification person. “Remove from Directory” clears the assignment without deleting the ID record or QR token.
- Directory Category is a free-text field with suggestions, not a fixed designation list. `Contact` and `Barangay Staff` are reserved directory sections; every other exact category becomes a Functionaries group heading. `data/content.js` excludes the reserved headings server-side when loading Functionaries so custom local headings remain supported and paginated correctly.
- `staff/ui.js`: shared typed forms, record details, mobile record cards, and in-page action confirmations. Save errors remain inside the open editor so the draft is not lost.
- `staff/settings-screen.js`: singleton settings and five-cover draft/publish flow with in-page confirmations. Photos are compressed in `media/images.js` before upload.
- `staff/dashboard.js`: current counts and recent stored updates. Missing counts are not silently treated as zero.
- `staff/qr.js`: local PNG generation; existing tokens are preserved. `public/verify.js` uses the original manual and QR RPCs.
- `data/covers.js`: up to five public slides in `design_theme.brgyweblitev3_covers`. Atomic JSON comparison prevents a cover save from overwriting a concurrent theme edit.
- `design/public-renderer.js` nests those same saved covers inside `.hero` as `.hero-cover`; `design-system.css` darkens the image for readable hero text. No cover record, URL, bucket, or CRUD path is duplicated. If no cover is saved, the plain hero fallback remains.
- `design/public-renderer.js` also groups the full Officials route by the existing `position`: Punong Barangay; Barangay Kagawad; IPMR/Secretary/Treasurer; then SK Chairperson, SK Kagawad, and SK Secretary/Treasurer. Unknown positions remain visible under the appropriate Other tier. On narrow Home screens, the three-record preview stays in one compact row while the full route keeps its responsive hierarchy. Neither view duplicates Officials records or CRUD.
- `public/app.js` maps Officials, Staff, and Functionaries to `list_public_directory_records`. If a person is missing, check `directory_section`, `directory_subcategory`, `directory_is_published`, and the existing record's `status = ACTIVE`. The public RPC intentionally returns no ID number, QR token, or validity dates.
- `public/photo-viewer.js` opens uploaded Official, Staff, Functionary, and Community Gallery photos in one full-size dialog. Previous/next wraps within the selected photo group, so Gallery images do not mix with personnel images on Home. Keyboard arrows and mobile swipe use the same list. CSS placeholder icons are excluded because only HTTPS image records receive `data-photo-viewer`.
- `data/usage.js`: existing Storage metadata and public GitHub REST metadata only. No secret key or privileged backend was added.

## Temporary module access

- `data/permissions.js` defines the only delegable modules: ID records & QR, Cover photos, Design Studio, Page settings, Public visibility, and System status & usage.
- `staff/accounts-screen.js` gives every Content Admin six independent access cards. Each card has its own ON/OFF state, expiry choice, and Save button, so one grant never changes the others.
- `staff/workspace.js` hides ungranted routes and checks the live grants again before rendering a protected screen. `core/auth.js` also runs `requirePermission()` before protected data operations.
- Frontend guards improve navigation and errors, but they are not the security boundary. `staff_delegated_permissions`, protected RPCs, table RLS, and branding-folder Storage policies enforce the same permission and expiry server-side.
- Turning a grant off or letting it expire does not change the Content Admin's base role. Refresh the workspace after a System Admin changes access so navigation reflects the latest server state.

## Activity and analytics

- `staff/activity-screen.js` keeps **Public View**, **Content Admin**, and **System Admin** in separate tabs with Daily, Weekly, Monthly, and Annual Manila-calendar ranges.
- Public View contains allowlisted aggregate counters only. `data/activity.js` silently rejects unknown metric keys, and public callers never send identity, search text, verification inputs, or tokens.
- Staff rows come from server-side activity triggers plus explicit login, logout, export, and account-management records. They include the actor role/name, action, module, safe summary, and time.
- Deleting the selected range requires confirmation and calls a System-Admin-only RPC. The removed activity cannot be restored; a separate `activity_log_deletions` row preserves who deleted which scope/range and how many rows were removed.

When a create/save request fails after upload, close and refresh before retrying to avoid duplicates. Uploaded files are retained when a save outcome is uncertain. Existing files are not automatically deleted because they may have other references. Billing/quota/bandwidth/database size are deliberately unavailable, not zero.

For CSS, five-layout presets, previews, and safe publishing, read the [Design Studio guide](DESIGN-STUDIO.md). The only stylesheet is `assets/css/design-system.css`. New and changed code includes Purpose/dependencies/Debug comments.

Each JavaScript module starts with Purpose, dependencies, and Debug notes. Safeguards and request sequencing have nearby comments. Find the actual failing request instead of removing a safeguard to hide an error.

## Quick reference

| Problem | First place to look | Next check |
| --- | --- | --- |
| Local preview will not open | Output from `npm run dev` | Use the exact printed URL; a stopped server's old URL will not work |
| Supabase SDK will not load | `assets/js/core/client.js`, HTML script URL | Network/CDN availability and pinned version in `core/config.js` |
| Login fails | `assets/js/login.js`, `core/auth.js` | Auth response, matching `profiles.user_id`, active status, and required role |
| Incorrect staff destination/access | `core/auth.js`, `staff/workspace.js` | The live profile is authoritative, not user metadata or a cached role |
| Delegated module missing or denied | `data/permissions.js`, `staff/accounts-screen.js` | Target user, exact permission key, enabled state, expiry, RLS, and protected RPC |
| Activity totals or rows look wrong | `data/activity.js`, `staff/activity-screen.js` | Selected Manila period, scope tab, metric allowlist, trigger/RPC permissions, and deletion audit |
| Missing public content | `data/contracts.js`, `data/content.js` | Table/column names, public flag, pagination, and RLS errors |
| Incorrect profile/settings | `data/settings.js` | `site_settings.id=1` and existing `barangay-*` slugs, not legacy CSS/theme |
| Wrong public module visibility | `data/visibility.js`, `staff/visibility-screen.js` | Parent Directory state, individual module/group state, and `VISIBILITY_CONFLICT` |
| Wrong Functionaries heading/group | Directory record `category`, `data/content.js` | Use the exact local heading; verify its group visibility and `is_active` |
| ID/QR verification fails | `data/verification.js` | Original RPC arguments and existing QR token; never expose the private table |
| Upload/save problem | `data/storage.js` | Bucket policy, permitted file type/size, and `error.retainedUpload` |
| Content Admin approval problem | `data/editors.js` | `manage-editors` action, server error, System Admin role, and activation redirect configuration |
| Signup/activation problem | `data/applications.js` | Identify the failing stage: eligibility, Auth signup, application insert, or activation |
| Stale data appears after navigation | `core/router.js`, `staff/workspace.js` | `isCurrent()` and request-sequence checks after awaited calls |
| Secondary color does not appear | `design/model.js`, `design/runtime.js`, `design/studio.js` | Check `--secondary`/`--on-secondary`, selected preview screen, and the light sidebar override |
| Unexpected non-English text | Authored interface vs. stored content | All HTML shells use `lang="en"`; existing records and provider messages are displayed unchanged |

## Code flow

1. The HTML shell loads the pinned SDK and entry module.
2. The entry module obtains services from `core/services.js`.
3. `core/auth.js` validates the user, current staff profile, and any required live delegated grant.
4. A module in `data/` requests the existing Supabase resources or a protected RPC.
5. RLS, RPC checks, Storage policies, and the Edge Function enforce the actual permissions.
6. The public/staff view displays the result or error without changing permissions.

## Safe checks

```sh
npm test
npm run check
```

Tests use mock data and do not change live accounts or records. The source checker validates syntax, imports, script URLs, module headers, English HTML language metadata, and separation of logic from presentation.

To confirm public connectivity and anonymous-access restrictions:

```sh
npm run verify:live
```

This check is read-only. It does not verify real password login, authenticated writes, uploads, or approval actions; those need separate end-to-end verification.

## Important debugging rules

- Never log passwords, session tokens, secret keys, or private resident details.
- If a request is denied, inspect the actual role and server rules. Never remove RLS or put a service-role key in the browser.
- If an error includes `retainedUpload`, do not immediately retry or delete. A record may have saved even if the response was lost. Confirm the existing record and file reference first.
- V3 and the old website share a database. Real saves/deletions affect those shared records.
- Editing/upload controls require the correct active role or a valid per-user delegated grant. The public Design Studio is preview-only; publishing is available only in an authenticated, authorized workspace.
- Update nearby comments and related tests when behavior changes.

## Design Studio section saves

`assets/js/design/studio.js` groups Layout, Appearance, Hero, and Components with independent Save/Reset buttons and unsaved indicators. Section saves merge only their keys into the published baseline and reuse the protected design service with its existing conflict check. Other draft edits stay in preview. Layout selection changes structure only; the global default reset still resets the whole draft. Publish Everywhere remains available for an explicitly confirmed full save.

`assets/js/design/public-renderer.js` marks one-record tiers with `official-tier-single`; final rules in `assets/css/design-system.css` center these cards at desktop and mobile widths. Hero controls continue to present the existing Dashboard cover without changing its image record or CRUD.
