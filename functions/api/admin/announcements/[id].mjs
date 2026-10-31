// PUT    /api/admin/announcements/:id — edit or retire/republish announcement.
// DELETE /api/admin/announcements/:id — permanently delete announcement.
import { json, badRequest, notFound, forbidden, readJson, nowIso, uuid } from '../../../lib/http.mjs';
import { requireUser, requireAdmin } from '../../../lib/auth.mjs';

const MAX_TITLE_LEN = 120;
const MAX_BODY_LEN = 4000;

function announcementId(request, params) {
  if (params?.id) return String(params.id);
  const parts = new URL(request.url).pathname.split('/').filter(Boolean);
  return parts[parts.length - 1];
}

export async function onRequestPut({ request, env, params }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;
  if (!requireAdmin(user)) return forbidden('Admin access required');

  const id = announcementId(request, params);
  const existing = await env.DB.prepare(
    "SELECT id, title, body, status FROM announcements WHERE id = ?"
  ).bind(id).first();
  if (!existing) return notFound('Announcement not found');

  const body = await readJson(request);
  const title = body?.title !== undefined ? String(body.title).trim() : existing.title;
  const message = body?.body !== undefined ? String(body.body).trim() : existing.body;
  const status = body?.status !== undefined ? String(body.status).trim() : existing.status;

  if (!title) return badRequest('Title is required');
  if (title.length > MAX_TITLE_LEN) return badRequest(`Title cannot exceed ${MAX_TITLE_LEN} characters`);
  if (!message) return badRequest('Message body is required');
  if (message.length > MAX_BODY_LEN) return badRequest(`Message body cannot exceed ${MAX_BODY_LEN} characters`);
  if (status !== 'active' && status !== 'archived') return badRequest('Status must be active or archived');

  const now = nowIso();
  await env.DB.prepare(
    "UPDATE announcements SET title = ?, body = ?, status = ?, updated_at = ? WHERE id = ?"
  ).bind(title, message, status, now, id).run();

  const auditAction =
    existing.status === 'active' && status === 'archived'
      ? 'announcement_retire'
      : existing.status === 'archived' && status === 'active'
      ? 'announcement_republish'
      : 'announcement_edit';

  await env.DB.prepare(
    "INSERT INTO admin_audit (id, admin_id, action, target_user_id, created_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(uuid(), user.id, auditAction, id, now).run();

  return json({ ok: true, id, status });
}

export async function onRequestDelete({ request, env, params }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;
  if (!requireAdmin(user)) return forbidden('Admin access required');

  const id = announcementId(request, params);
  const r = await env.DB.prepare("DELETE FROM announcements WHERE id = ?").bind(id).run();
  if ((r.meta?.changes ?? 0) === 0) return notFound('Announcement not found');

  const now = nowIso();
  await env.DB.prepare(
    "INSERT INTO admin_audit (id, admin_id, action, target_user_id, created_at) VALUES (?, ?, 'announcement_delete', ?, ?)"
  ).bind(uuid(), user.id, id, now).run();

  return json({ ok: true });
}
