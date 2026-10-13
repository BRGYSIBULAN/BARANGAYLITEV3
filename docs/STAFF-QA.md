# Staff feature verification

## 2026-10-13 mobile and deployment pass

The public homepage, Verify ID controls, officials photo viewer, Page Settings dialog, and Design Studio were inspected at a 390 × 844 mobile viewport. No horizontal overflow or browser-console errors were observed. The personnel photo viewer stayed within the viewport while preserving the original uploaded image, caption, and Previous/Next navigation.

Page Settings remained editable, maintenance mode was visibly off, and preview worked. The Design Studio retained the published design after reload without showing a stale layout. The camera permission prompt and all production save operations were intentionally left untouched.

The read-only live verifier passed the published-content boundaries, private-table denials, public Directory output, staff Directory denial, verification contracts, and pinned Supabase SDK check. The deployment verifier confirmed that all 70 public HTML and `assets/` files matched the live Git commit byte-for-byte. No live record, setting, file, account, permission, or deployment was changed during these checks.

## 2026-09-04 staff feature pass

The shared admin dashboard was visually inspected in Design Studio and its mobile frame measured 375px content width / 375px scroll width. Public verification loaded the existing barangay identity, original ID-number-plus-last-name form, camera-off default, and saved-QR input.

Automated tests cover actual form submit handlers, error retention, safe table/result rendering, cover max-five validation and protected namespace saves, role/permission checks on guarded modules, temporary-grant expiry, separate activity scopes and Manila-calendar ranges, privacy-safe public metric keys, original ID expiry rules, production QR URL construction, and decoding a generated QR with an independent decoder.

The live project was inspected read-only to confirm the delegated-permission, staff-activity, public-metric, deletion-audit, protected RPC, trigger, RLS, and Storage-policy contracts already exist. The database timezone remains UTC; activity reporting converts boundaries to the barangay's Asia/Manila calendar, and the public verification result still trusts the original RPC's returned status. No live account, grant, activity row, content record, token, file, or setting was changed by these checks.

Not exercised against production: authenticated save/delete/upload, permission granting, activity deletion, invitation/approval emails, actual camera hardware scanning, and printing a physical QR. These actions require the user's normal staff session, explicit confirmation, or hardware and were not simulated as production successes. Billing, plan quotas, database disk size and bandwidth are not connected, and are explicitly labeled unavailable rather than zero.
