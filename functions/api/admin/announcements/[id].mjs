// PUT    /api/admin/announcements/:id — edit announcement.
// DELETE /api/admin/announcements/:id — delete announcement.
import { json, badRequest, notFound, forbidden, readJson, nowIso, uuid } from '../../../lib/http.mjs';
import { requireUser, requireAdmin } from '../../../lib/auth.mjs';

function announcementId(request) {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 1];
}

export async function onRequestPut({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;
  if (!requireAdmin(user)) return forbidden('Admin access required');

  const id = announcementId(request);
  const body = await readJson(request);
  const title = String(body?.title || '').trim();
  const message = String(body?.body || '').trim();
  const status = String(body?.status || 'active').trim();

  if (!title) return badRequest('Title is required');
  if (title.length > 80) return badRequest('Title cannot exceed 80 characters');
  if (!message) return badRequest('Message body is required');
  if (message.length > 1000) return badRequest('Message body cannot exceed 1000 characters');
  if (status !== 'active' && status !== 'archived') return badRequest('Status must be active or archived');

  const now = nowIso();
  const r = await env.DB.prepare(
    "UPDATE announcements SET title = ?, body = ?, status = ?, updated_at = ? WHERE id = ?"
  ).bind(title, message, status, now, id).run();

  if ((r.meta?.changes ?? 0) === 0) return notFound('Announcement not found');

  await env.DB.prepare(
    "INSERT INTO admin_audit (id, admin_id, action, target_user_id, created_at) VALUES (?, ?, 'announcement_edit', ?, ?)"
  ).bind(uuid(), user.id, id, now).run();

  return json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;
  if (!requireAdmin(user)) return forbidden('Admin access required');

  const id = announcementId(request);
  const r = await env.DB.prepare("DELETE FROM announcements WHERE id = ?").bind(id).run();
  if ((r.meta?.changes ?? 0) === 0) return notFound('Announcement not found');

  const now = nowIso();
  await env.DB.prepare(
    "INSERT INTO admin_audit (id, admin_id, action, target_user_id, created_at) VALUES (?, ?, 'announcement_delete', ?, ?)"
  ).bind(uuid(), user.id, id, now).run();

  return json({ ok: true });
}
