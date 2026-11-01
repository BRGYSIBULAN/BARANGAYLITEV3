/**
 * Purpose: mount the public, write-free Design Studio playground.
 * Depends on: studio.js only; intentionally no SDK, auth token, or data write services.
 * Debug: disabled Publish is expected here; actual publishing is in admin/#design-studio.
 */
import { mountStudio } from './studio.js?v=74ce2e2fa5b2';
mountStudio(document.querySelector('#studio-root'));
