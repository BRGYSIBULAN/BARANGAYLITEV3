/**
 * Purpose: start the Content Admin shell without System Admin management routes.
 * Depends on: editor/index.html, the deferred SDK, and staff/workspace.js.
 * Debug: check the editor route list and active profile, not a browser role cache.
 */
import { startWorkspace } from '../staff/workspace.js?v=7a6c0b49dfbb';
const start = () => startWorkspace('editor');
if (document.readyState !== 'complete') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
