// POST /api/admin/inbox/:id/publish — publish or unpublish an answered item to the community.
import { json, badRequest, notFound, forbidden, readJson, nowIso, uuid } from '../../../../lib/http.mjs';
import { requireUser, requireAdmin } from '../../../../lib/auth.mjs';

function inboxId(request) {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 2];
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;
  if (!requireAdmin(user)) return forbidden('Admin access required');

  const id = inboxId(request);
  const body = await readJson(request);
  const shouldPublish = body?.publish !== false;

  const inboxItem = await env.DB.prepare(
    'SELECT li.id, li.type, li.allow_group_share, li.status, cr.id AS reply_id FROM leader_inbox li LEFT JOIN community_replies cr ON cr.inbox_id = li.id WHERE li.id = ?'
  ).bind(id).first();

  if (!inboxItem) return notFound('Inbox item not found');

  if (shouldPublish) {
    if (!inboxItem.reply_id) {
      return badRequest('Cannot publish an item without a leader reply. Write a reply first.');
    }
    if ((inboxItem.type === 'prayer' || inboxItem.type === 'application') && !inboxItem.allow_group_share) {
      return badRequest(`Cannot publish this ${inboxItem.type}: author has not granted permission to share with the group.`);
    }
  }

  const now = nowIso();
  const newStatus = shouldPublish ? 'published' : 'answered';
  await env.DB.prepare('UPDATE leader_inbox SET status = ?, updated_at = ? WHERE id = ?').bind(newStatus, now, id).run();

  await env.DB.prepare(
    'INSERT INTO admin_audit (id, admin_id, action, target_user_id, created_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(uuid(), user.id, shouldPublish ? 'community_publish' : 'community_unpublish', id, now).run();

  return json({ ok: true, status: newStatus });
}
