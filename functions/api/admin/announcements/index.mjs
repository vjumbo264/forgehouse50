// GET  /api/admin/announcements — list all announcements (active & archived).
// POST /api/admin/announcements — create an announcement.
import { json, badRequest, forbidden, readJson, nowIso, uuid } from '../../../lib/http.mjs';
import { requireUser, requireAdmin } from '../../../lib/auth.mjs';

const MAX_TITLE_LEN = 120;
const MAX_BODY_LEN = 4000;

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;
  if (!requireAdmin(user)) return forbidden('Admin access required');

  const { results } = await env.DB.prepare(
    "SELECT id, title, body, status, created_by, created_at, updated_at FROM announcements ORDER BY created_at DESC"
  ).all();

  return json(
    { ok: true, announcements: results || [] },
    200,
    { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
  );
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;
  if (!requireAdmin(user)) return forbidden('Admin access required');

  const body = await readJson(request);
  const title = String(body?.title || '').trim();
  const message = String(body?.body || '').trim();
  const status = String(body?.status || 'active').trim();

  if (!title) return badRequest('Title is required');
  if (title.length > MAX_TITLE_LEN) return badRequest(`Title cannot exceed ${MAX_TITLE_LEN} characters`);
  if (!message) return badRequest('Message body is required');
  if (message.length > MAX_BODY_LEN) return badRequest(`Message body cannot exceed ${MAX_BODY_LEN} characters`);
  if (status !== 'active' && status !== 'archived') return badRequest('Status must be active or archived');

  const id = uuid();
  const now = nowIso();

  await env.DB.prepare(
    "INSERT INTO announcements (id, title, body, created_by, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(id, title, message, user.id, status, now, now).run();

  await env.DB.prepare(
    "INSERT INTO admin_audit (id, admin_id, action, target_user_id, created_at) VALUES (?, ?, 'announcement_create', ?, ?)"
  ).bind(uuid(), user.id, id, now).run();

  return json({ ok: true, id, status }, 201);
}
