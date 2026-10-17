// POST   /api/admin/inbox/:id/reply — create or update leader reply.
// DELETE /api/admin/inbox/:id/reply — remove reply and revert status.
import { json, badRequest, notFound, forbidden, readJson, nowIso, uuid } from '../../../../lib/http.mjs';
import { requireUser, requireAdmin } from '../../../../lib/auth.mjs';

function inboxId(request) {
  const parts = new URL(request.url).pathname.split('/');
  // URL: /api/admin/inbox/:id/reply
  return parts[parts.length - 2];
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;
  if (!requireAdmin(user)) return forbidden('Admin access required');

  const id = inboxId(request);
  const body = await readJson(request);
  const replyText = String(body?.text || '').trim();
  if (!replyText) return badRequest('Reply text is required');

  const inboxItem = await env.DB.prepare('SELECT id, status FROM leader_inbox WHERE id = ?').bind(id).first();
  if (!inboxItem) return notFound('Inbox item not found');

  const now = nowIso();
  const existingReply = await env.DB.prepare('SELECT id FROM community_replies WHERE inbox_id = ?').bind(id).first();

  let replyId;
  if (existingReply) {
    replyId = existingReply.id;
    await env.DB.prepare(
      'UPDATE community_replies SET text = ?, admin_id = ?, updated_at = ? WHERE id = ?'
    ).bind(replyText, user.id, now, replyId).run();
  } else {
    replyId = uuid();
    await env.DB.prepare(
      'INSERT INTO community_replies (id, inbox_id, admin_id, text, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(replyId, id, user.id, replyText, now, now).run();
  }

  // If item was 'new', mark it as 'answered'
  if (inboxItem.status === 'new') {
    await env.DB.prepare('UPDATE leader_inbox SET status = \x27answered\x27, updated_at = ? WHERE id = ?').bind(now, id).run();
  }

  // Audit
  await env.DB.prepare(
    'INSERT INTO admin_audit (id, admin_id, action, target_user_id, created_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(uuid(), user.id, 'leader_reply', id, now).run();

  return json({ ok: true, reply_id: replyId, status: inboxItem.status === 'new' ? 'answered' : inboxItem.status });
}

export async function onRequestDelete({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;
  if (!requireAdmin(user)) return forbidden('Admin access required');

  const id = inboxId(request);
  await env.DB.prepare('DELETE FROM community_replies WHERE inbox_id = ?').bind(id).run();
  // Revert status to 'new' if it was 'answered' or 'published'
  const now = nowIso();
  await env.DB.prepare('UPDATE leader_inbox SET status = \x27new\x27, updated_at = ? WHERE id = ?').bind(now, id).run();

  await env.DB.prepare(
    'INSERT INTO admin_audit (id, admin_id, action, target_user_id, created_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(uuid(), user.id, 'leader_reply_delete', id, now).run();

  return json({ ok: true });
}
