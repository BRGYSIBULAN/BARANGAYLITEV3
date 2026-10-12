/**
 * Purpose: reuse existing file buckets while preventing accidental file replacement.
 * Depends on: bucket MIME/size contracts, staff authorization, and content.save().
 * Debug: check bucket policy, file type/size, and retainedUpload on an uncertain save.
 */
import { SUPABASE_URL } from '../core/config.js?v=96b812c63105';
import { unwrap } from '../core/client.js?v=96b812c63105';
import { contentContract } from './contracts.js?v=96b812c63105';

const documents = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
export const BUCKETS = Object.freeze({
  forms: { max: 10 * 1024 * 1024, types: documents },
  'disclosure-documents': { max: 10 * 1024 * 1024, types: documents },
  'gallery-media': { max: 5 * 1024 * 1024, types: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] },
  'branding-media': { max: 2 * 1024 * 1024, types: ['image/jpeg', 'image/png', 'image/webp'], adminOnly: true },
});

/** Resolve only files owned by this project/bucket; refuse foreign URLs and traversal. */
export function ownedObjectPath(bucket, url) {
  if (!Object.hasOwn(BUCKETS, bucket)) throw new Error('Unsupported storage bucket.');
  try {
    const parsed = new URL(url);
    const prefix = `/storage/v1/object/public/${bucket}/`;
    if (parsed.origin !== SUPABASE_URL || !parsed.pathname.startsWith(prefix)) return null;
    const path = decodeURIComponent(parsed.pathname.slice(prefix.length));
    if (!path || path.split('/').some(part => !part || part === '..' || part === '.') || path.includes('\\')) return null;
    return path;
  } catch { return null; }
}

export function createStorage(client, auth, content) {
  /** Branding requires the exact delegated purpose; other existing buckets allow active staff. */
  async function authorize(bucket, permission = null) {
    if (!Object.hasOwn(BUCKETS, bucket)) throw new Error('Unsupported storage bucket.');
    const def = BUCKETS[bucket];
    if (def.adminOnly) {
      if (!['covers', 'page_settings'].includes(permission)) throw new Error('Choose an approved branding upload purpose.');
      await auth.requirePermission(permission);
    } else await auth.requireStaff(['admin', 'editor']);
    return def;
  }
  /** Validate before uploading, then allocate a fresh path rather than overwriting files. */
  async function upload(bucket, file, { permission = null } = {}) {
    const def = await authorize(bucket, permission);
    if (!file || file.size <= 0 || file.size > def.max || !def.types.includes(file.type)) throw new Error('Unsupported file type or file size for this bucket.');
    const extension = (file.name.split('.').pop() || 'file').toLowerCase().replace(/[^a-z0-9]/g, '') || 'file';
    // Unique paths never overwrite an existing logo, document, or image.
    // Branding RLS limits a delegated editor to their granted folder. Content
    // buckets retain the existing year-based paths and staff policies.
    const prefix = bucket === 'branding-media' ? permission : String(new Date().getFullYear());
    const path = `${prefix}/${crypto.randomUUID()}.${extension}`;
    unwrap(await client.storage.from(bucket).upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type }));
    const url = client.storage.from(bucket).getPublicUrl(path).data?.publicUrl;
    if (!url) throw new Error('Upload succeeded but the public URL is unavailable.');
    return { bucket, path, url };
  }

  /** Destructive, explicit operation: caller must confirm intent and check other links. */
  async function removeObject(bucket, url, { permission = null } = {}) {
    await authorize(bucket, permission);
    const path = ownedObjectPath(bucket, url);
    if (!path) throw new Error('Refusing to remove a file outside the existing project/bucket.');
    unwrap(await client.storage.from(bucket).remove([path]));
  }

  /** Upload first, then save metadata. An uncertain save retains the uploaded object. */
  async function saveWithUpload(table, values, id, file) {
    const def = contentContract(table);
    if (!def.bucket) throw new Error('This content type does not have an upload bucket.');
    if (!file) return content.save(table, values, id);
    const uploaded = await upload(def.bucket, file);
    const payload = { ...values, [def.fileField]: uploaded.url };
    if (table === 'forms') Object.assign(payload, { file_name: file.name, file_type: file.type, file_size: file.size });
    try {
      // A lost response may conceal a committed record write. Never delete the
      // uploaded object automatically: a record might already reference it.
      return await content.save(table, payload, id);
    } catch (error) {
      error.message += ' The uploaded file was retained. Check whether the record saved before retrying.';
      error.retainedUpload = uploaded;
      throw error;
    }
    // Existing files are deliberately retained; they may still be linked elsewhere.
  }
  return Object.freeze({ upload, removeObject, saveWithUpload });
}
