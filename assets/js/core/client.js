/**
 * Purpose: create one shared Supabase client without loading any design code.
 * Depends on: config.js and the pinned browser SDK loaded by the HTML shell.
 * Debug: a missing SDK error means check the external script/network first.
 */
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, AUTH_STORAGE_KEY } from './config.js?v=a3648db587e2';
import { browserStorage, createSessionStore } from './session-storage.js?v=a3648db587e2';

let singleton, sessionStore;
/** Reuse the client so auth refresh and session listeners are not duplicated. */
export function getClient() {
  if (singleton) return singleton;
  const createClient = globalThis.supabase?.createClient;
  if (!createClient) throw new Error('The Supabase connection could not be loaded. Please try again.');
  sessionStore = createSessionStore({ key: AUTH_STORAGE_KEY, persistent: browserStorage('localStorage'), temporary: browserStorage('sessionStorage') });
  singleton = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storageKey: AUTH_STORAGE_KEY,
      storage: sessionStore,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return singleton;
}

/** The form changes token persistence, not passwords or the user's server-side access rights. */
export function rememberDevice() { getClient(); return sessionStore.remember(); }
export function setRememberDevice(value) { getClient(); sessionStore.setRemember(value); }

/** Supabase returns { data, error }; throw errors so callers cannot show false success. */
export function unwrap(result) {
  if (result.error) throw result.error;
  return result.data;
}
