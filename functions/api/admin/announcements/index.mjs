// GET  /api/admin/announcements — list all announcements (active & archived).
// POST /api/admin/announcements — create an announcement.
import { json, badRequest, forbidden, readJson, nowIso, uuid } from '../../../lib/http.mjs';
import { requireUser, requireAdmin } from '../../../lib/auth.mjs';

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;
  if (!requireAdmin(user)) return forbidden('Admin access required');

  const { results } = await env.DB.prepare(
    "SELECT id, title, body, status, created_by, created_at, updated_at FROM announcements ORDER BY created_at DESC"
  ).all();

  return json({ ok: true, announcements: results || [] });
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;
  if (!requireAdmin(user)) return forbidden('Admin access required');

  const body = await readJson(request);
  const title = String(body?.title || '').trim();
  const message = String(body?.body || '').trim();

  if (!title) return badRequest('Title is required');
  if (title.length > 80) return badRequest('Title cannot exceed 80 characters');
  if (!message) return badRequest('Message body is required');
  if (message.length > 1000) return badRequest('Message body cannot exceed 1000 characters');

  const id = uuid();
  const now = nowIso();
  await env.DB.prepare(
    "INSERT INTO announcements (id, title, body, created_by, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, ?)"
  ).bind(id, title, message, user.id, now, now).run();

  await env.DB.prepare(
    "INSERT INTO admin_audit (id, admin_id, action, target_user_id, created_at) VALUES (?, ?, 'announcement_create', ?, ?)"
  ).bind(uuid(), user.id, id, now).run();

  return json({ ok: true, id }, 201);
}
