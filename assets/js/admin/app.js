/**
 * Purpose: start the System Admin shell, with its admin-only route guard.
 * Depends on: admin/index.html, the deferred SDK, and staff/workspace.js.
 * Debug: shared screen behavior lives in workspace.js; permissions live in core/auth.js.
 */
import { startWorkspace } from '../staff/workspace.js?v=74ce2e2fa5b2';
const start = () => startWorkspace('admin');
if (document.readyState !== 'complete') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
