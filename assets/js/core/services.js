/**
 * Purpose: assemble the data/auth services shared by all three app shells.
 * Depends on: core client/auth and the modules under data/.
 * Debug: follow a service name here to its implementation; tests inject a mock client.
 */
import { getClient } from './client.js?v=a3648db587e2';
import { createAuth } from './auth.js?v=a3648db587e2';
import { createContent } from '../data/content.js?v=a3648db587e2';
import { createSettings } from '../data/settings.js?v=a3648db587e2';
import { createVerification } from '../data/verification.js?v=a3648db587e2';
import { createStorage } from '../data/storage.js?v=a3648db587e2';
import { createEditors } from '../data/editors.js?v=a3648db587e2';
import { createApplications } from '../data/applications.js?v=a3648db587e2';
import { createDesign } from '../data/design.js?v=a3648db587e2';
import { createCovers } from '../data/covers.js?v=a3648db587e2';
import { createUsage } from '../data/usage.js?v=a3648db587e2';
import { createVisibility } from '../data/visibility.js?v=a3648db587e2';
import { createPermissions } from '../data/permissions.js?v=a3648db587e2';
import { createActivity } from '../data/activity.js?v=a3648db587e2';
import { createDirectory } from '../data/directory.js?v=a3648db587e2';

/** Dependency injection keeps tests away from production accounts and records. */
export function createServices(client) {
  const auth = createAuth(client);
  const content = createContent(client, auth);
  const directory = createDirectory(client, auth);
  const permissions = createPermissions(client, auth);
  const activity = createActivity(client, auth);
  return Object.freeze({
    auth, content, directory,
    settings: createSettings(client, auth),
    verification: createVerification(client, auth),
    storage: createStorage(client, auth, content),
    editors: createEditors(client, auth),
    applications: createApplications(client, auth),
    design: createDesign(client, auth),
    covers: createCovers(client, auth),
    visibility: createVisibility(client, auth),
    usage: createUsage(client, auth),
    permissions,
    activity,
  });
}
/** Browser entry point: service wrappers share the single configured client. */
export const getServices = () => createServices(getClient());
