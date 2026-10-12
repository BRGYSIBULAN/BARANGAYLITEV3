# BRGYWEBLITEV3

**Live website:** https://brgysibulan.github.io/BARANGAYLITEV3/

Logic-first continuation of `Brgysibulan/BRGYWEB-LITE`, using the **same existing Supabase project**, records, Auth accounts, permissions, RPCs, and Storage buckets.

## Current stage

The redesigned staff workspace now supports editable public content, real dashboard aggregates, ID records and downloadable QR files, up to five compressed homepage covers, site settings, Content Admin management, measured file-storage/GitHub status, and separated activity analytics. The shared Design Studio provides eight government layouts plus validated typography, spacing, surface, navigation, card, header, and hero-photo controls. A System Admin can temporarily delegate selected protected modules to one Content Admin at a time without changing that account's role. Existing System Admin credentials and the original verification rules are unchanged.

Design Studio includes main, secondary, and accent color pickers with matching hex inputs. Its hero layer follows the chosen main or secondary color, offers controlled photo visibility/treatment/position, and previews the same existing Dashboard cover without copying its record. The secondary color controls supporting panels while preserving older saved palettes. The authored interface is fully English; stored barangay content is not translated or modified.

Live Page Settings is `admin/index.html#settings`, not the sample Design Studio iframe. It is always available to System Admins and is shown to a Content Admin only while that individual has a valid `page_settings` grant. Maintenance has dedicated enable/disable, notice editing, and preview controls. The existing flag pauses public pages and ID verification, including open tabs after the next availability check, while keeping the Admin Portal and authenticated dashboards accessible. Loading or testing the frontend does not alter any live grant or maintenance value.

The Admin Portal login says **Welcome** and uses the first saved homepage cover as its background, with a transparent readability overlay. It reads the existing Cover 1 URL instead of uploading or copying another image.

Public service pages are informational and do not collect online payments; any required transaction is completed directly at the Barangay Hall with an official receipt.

The public navigation is organized as Home, News & Updates, Services, About, Directory, and Admin Portal. In both staff workspaces, **Directory** is organized into separate **Barangay Officials**, **Barangay Staff**, and **Barangay Functionaries** managers. All three managers list the existing people from `verification_records`; the operator assigns only the Directory category, Staff/Functionary subcategory, photo/icon, display order, and Publish switch. Names and designations are never retyped or copied into another personnel table. The public site calls a privacy-limited RPC that returns only explicitly published display fields from ACTIVE records—never ID numbers, QR tokens, or dates. Officials need no subcategory because their existing designation drives the Barangay Council/SK hierarchy. Records without a photo receive a neutral public profile icon.

Public verification is at `verify.html`. Manual lookup requires ID number plus last name, as in the original website. QR codes use the existing record token and the permanent GitHub Pages address. Public analytics stores only approved aggregate counters, never visitor identity, search text, ID numbers, last names, or QR tokens. Billing, quota, bandwidth and database disk size are explicitly unavailable until a separately authorized provider integration exists.

Writes run only after an explicit staff action. The application/activation screens reuse existing eligibility and role guards. All CSS remains in the central design system. Pinned local QR assets can be refreshed with `npm run vendor`; no external QR generation service receives ID tokens. See [continuation notes](docs/CONTINUATION.md), the [2026-10-12 Supabase security review](docs/SECURITY-REVIEW-2026-10-12.md), the [Data API grants audit](docs/DATA-API-GRANTS-AUDIT-2026-10-12.md), [Design Studio documentation](docs/DESIGN-STUDIO.md), and the [debugging map](docs/DEBUGGING.md).

## Existing system preserved

- Supabase: `pkvorwvkqjnbgktkgjhr` (`BRGYWEB-LITE`), **not WebSaaS**.
- Auth: existing `auth.users` and active roles in `public.profiles`.
- Existing public-content tables retain their data, IDs, and RLS. Five Directory-only metadata fields and narrowly scoped staff/public RPCs were added to `verification_records`; existing identity, ID, status, date, and QR fields were not changed.
- Existing QR tokens, file URLs, and 4 Storage buckets are unchanged.
- The deployed `manage-editors` Edge Function and protected RPCs are reused; browser code never receives a service-role key.
- The V3 design is saved only under `site_settings.design_theme.brgyweblitev3`; legacy JSON keys and color columns are preserved. No legacy CSS is executed.
- V3 has a separate browser-session storage key. The same account can sign in, but old-site session tokens are not copied, cleared, or overwritten.

**Shared data warning:** a future explicit edit through V3 changes the same records used by the old website. There is no copied or staging database.

## Structure

```text
index.html                    Public shell
admin/index.html              System Admin shell
editor/index.html             Content Admin shell
login.html                    Existing Admin Portal login
assets/js/core/               Client, verified roles, service composition, routing
assets/js/data/               Presentation-independent data operations
assets/js/staff/              Staff workspace screens and guarded actions
assets/js/design/             Shared layouts, live design runtime, and isolated previews
assets/css/design-system.css  All CSS and responsive layout rules
design-studio.html            Public sample playground (no publishing)
signup.html / activate.html   Existing Content Admin application/activation flows
assets/js/public/             Published public data view
tests/                        Mocked safety and contract tests
scripts/                      Local checks and read-only live verification
supabase/migrations/          Applied, reviewable Directory schema/RPC migrations
docs/REWIRE-AUDIT.md           Exact migration boundaries and remaining work
docs/DEBUGGING.md              Where to look when a feature fails
```

No frontend framework, build step, or Node backend is required for hosting. The optional Node scripts are developer tools only. The browser SDK is pinned to `@supabase/supabase-js@2.112.4`; no floating `@2` dependency.

Every JavaScript module has a purpose/dependency/debugging header, with focused comments on important safeguards. See `AGENTS.md` for the continuing comment requirement and `docs/DEBUGGING.md` for the troubleshooting map.

## Local checks

```sh
npm test
npm run check
npm run dev
```

The local server prints its exact URL. The live verifier needs network access and performs reads only:

```sh
npm run verify:live
```

To confirm that GitHub Pages is serving the exact HTML, CSS, JavaScript, vendor, and image files from the selected local commit:

```sh
npm run verify:deployment
```

The deployment verifier makes public GET requests only. It does not push, deploy, authenticate, or change Supabase data.

Never put a Supabase secret/service-role key in this frontend. The configured publishable key is intentionally public; the existing database policies and Edge Function authorization enforce access.

## Deployment boundary

The static source can be served by the existing GitHub Pages workflow or ordinary static hosting. No new hosting provider, Supabase project, account, or Auth redirect allowlist was created. The three committed Directory migrations match the migrations already applied to the existing project. Application/activation screens reuse the existing services; invitation email redirects still need the owner to validate their production URL against the existing Auth configuration. No invitation, signup, password update, Directory assignment, or live theme publication is performed by the automated tests.


## Footer design options

Design Studio includes four responsive footer styles: Civic columns, Light institutional, Accent band, and Minimal. Every style follows the published primary, secondary, and accent colors and keeps the same official navigation and contact data.
