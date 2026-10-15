// PUT /api/profile/picture — upload/replace user profile picture
// DELETE /api/profile/picture — delete user profile picture (revert to avatar)
import { json, badRequest, unauthorized, nowIso, uuid } from '../../lib/http.mjs';
import { requireUser } from '../../lib/auth.mjs';

const MAX_BYTES = 100 * 1024; // 100 KB
const MAX_UPLOADS_PER_DAY = 5;

export function detectMagicBytes(bytes) {
  if (!bytes || bytes.length < 12) return null;
  // JPEG: FF D8 FF
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
    return 'image/jpeg';
  }
  // WebP: RIFF at 0..3 (0x52, 0x49, 0x46, 0x46) and WEBP at 8..11 (0x57, 0x45, 0x42, 0x50)
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return 'image/webp';
  }
  return null;
}

export async function onRequestPut({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;

  const contentTypeHeader = (request.headers.get('content-type') || '').toLowerCase().split(';')[0].trim();
  if (contentTypeHeader !== 'image/jpeg' && contentTypeHeader !== 'image/webp') {
    return badRequest('Content-Type must be image/jpeg or image/webp');
  }

  const arrayBuffer = await request.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  if (bytes.length === 0) {
    return badRequest('Image payload cannot be empty');
  }
  if (bytes.length > MAX_BYTES) {
    return badRequest(`Image size (${bytes.length} bytes) exceeds 100 KB limit`);
  }

  const detected = detectMagicBytes(bytes);
  if (!detected) {
    return badRequest('Invalid image format: must be valid JPEG or WebP data');
  }
  if (detected !== contentTypeHeader) {
    return badRequest(`Content-Type header (${contentTypeHeader}) does not match image data (${detected})`);
  }

  // Rate limiting: 5 uploads per user per rolling 24 hours
  const windowTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const rateRow = await env.DB.prepare(
    'SELECT COUNT(*) AS count, MIN(uploaded_at) AS oldest FROM profile_picture_uploads WHERE user_id = ? AND uploaded_at >= ?'
  ).bind(user.id, windowTime).first();

  const uploadCount = rateRow?.count ?? 0;
  if (uploadCount >= MAX_UPLOADS_PER_DAY) {
    const oldestMs = rateRow?.oldest ? new Date(rateRow.oldest).getTime() : Date.now();
    const retryMs = Math.max(0, (oldestMs + 24 * 60 * 60 * 1000) - Date.now());
    const retryMinutes = Math.max(1, Math.ceil(retryMs / 60000));
    return new Response(JSON.stringify({
      error: 'Daily upload limit reached. Maximum 5 picture updates per 24 hours.',
      retry_after_minutes: retryMinutes,
    }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(Math.ceil(retryMs / 1000)),
      },
    });
  }

  // Fetch current version to bump monotonically
  const current = await env.DB.prepare(
    'SELECT version FROM profile_pictures WHERE user_id = ?'
  ).bind(user.id).first();
  const nextVersion = (current?.version ?? 0) + 1;
  const now = nowIso();
  const uploadId = uuid();

  // Atomically update profile_pictures and log upload timestamp
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO profile_pictures (user_id, content_type, bytes, version, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        content_type = excluded.content_type,
        bytes = excluded.bytes,
        version = excluded.version,
        updated_at = excluded.updated_at
    `).bind(user.id, detected, bytes, nextVersion, now),
    env.DB.prepare(
      'INSERT INTO profile_picture_uploads (id, user_id, uploaded_at) VALUES (?, ?, ?)'
    ).bind(uploadId, user.id, now),
  ]);

  return json({ ok: true, version: nextVersion, content_type: detected });
}

export async function onRequestDelete({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;

  await env.DB.prepare('DELETE FROM profile_pictures WHERE user_id = ?').bind(user.id).run();
  return json({ ok: true, message: 'Profile picture removed; reverted to illustration avatar' });
}
