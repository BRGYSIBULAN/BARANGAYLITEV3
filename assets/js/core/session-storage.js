/**
 * Purpose: honor Remember me for V3 auth sessions without storing the user's password.
 * Depends on: optional browser local/session storage and the existing V3 auth namespace.
 * Debug: inspect the checkbox preference and storage availability; never print stored session values.
 */

/** Probe storage before offering persistence; blocked storage must not silently break a redirect. */
export function browserStorage(name) {
  try {
    const store = globalThis[name];
    if (!store) return null;
    const probe = 'brgysi:storage-probe:' + Math.random().toString(36).slice(2);
    store.setItem(probe, '1'); store.removeItem(probe); return store;
  } catch { return null; }
}

/** Supabase uses this adapter for tokens; it never receives the password form value. */
export function createSessionStore({ key, persistent = null, temporary = null }) {
  const preference = key + ':remember-device';
  const memory = new Map();
  const volatile = temporary || {
    getItem: name => memory.get(name) ?? null,
    setItem: (name, value) => memory.set(name, value),
    removeItem: name => memory.delete(name),
  };
  let fallbackRemember = false;
  const read = (store, name) => { try { return store?.getItem(name) ?? null; } catch { return null; } };
  const remember = () => {
    const value = read(persistent, preference);
    // Preserve sessions saved before the checkbox existed until the owner chooses otherwise.
    return value === null ? read(persistent, key) !== null || fallbackRemember : value === 'true';
  };
  const selected = () => remember() && persistent ? persistent : volatile;
  const ownedKeys = () => {
    const names = new Set([key, key + '-code-verifier', key + '-user']);
    for (const store of [persistent, temporary]) {
      if (!store) continue;
      for (let index = 0; index < store.length; index++) {
        const name = store.key(index);
        if (name === key || name?.startsWith(key + '-')) names.add(name);
      }
    }
    return names;
  };
  return {
    remember,
    /** Move only this app's auth namespace; never touch the legacy site's login or other data. */
    setRemember(value) {
      const next = value === true;
      if (next && !persistent) throw new Error('Remember me requires browser storage. Allow storage or leave it unchecked.');
      if (!next && !temporary) throw new Error('Browser session storage is unavailable. Allow storage before signing in.');
      const previous = selected(), destination = next ? persistent : volatile;
      const values = [...ownedKeys()].map(name => [name, read(previous, name)]);
      // Commit the choice before signing in so refreshes keep using the requested storage.
      if (persistent) persistent.setItem(preference, String(next));
      fallbackRemember = next;
      for (const [name, stored] of values) {
        if (stored !== null) destination.setItem(name, stored);
        for (const store of [persistent, volatile]) if (store && store !== destination) store.removeItem(name);
      }
    },
    getItem(name) { return read(selected(), name); },
    setItem(name, value) {
      selected().setItem(name, value);
      // A remembered login must not leave an older tab-session token that could reappear later.
      if (selected() !== volatile) volatile.removeItem(name);
      else persistent?.removeItem(name);
    },
    removeItem(name) { persistent?.removeItem(name); volatile.removeItem(name); },
  };
}
