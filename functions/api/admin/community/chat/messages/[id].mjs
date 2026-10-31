// DELETE /api/admin/community/chat/messages/:id — soft delete any chat message
import { json, forbidden, notFound, uuid } from '../../../../../lib/http.mjs';
import { requireUser, requireAdmin } from '../../../../../lib/auth.mjs';

function messageId(request) {
  const parts = new URL(request.url).pathname.split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

export async function onRequestDelete({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;
  if (!requireAdmin(user)) return forbidden('Admin access required');

  const id = messageId(request);
  const nowMs = typeof env.NOW_MS === 'number' ? env.NOW_MS : Date.now();
  const now = new Date(nowMs).toISOString();

  const res = await env.DB.prepare(
    'UPDATE community_chat_messages SET is_deleted = 1, deleted_by = ?, updated_at = ? WHERE id = ?'
  )
    .bind(user.id, now, id)
    .run();

  if ((res.meta?.changes ?? 0) === 0) {
    return notFound('Message not found');
  }

  await env.DB.prepare(
    "INSERT INTO admin_audit (id, admin_id, action, target_user_id, target_display_name, created_at) VALUES (?, ?, 'chat_message_delete', ?, ?, ?)"
  )
    .bind(uuid(), user.id, id, user.username || 'admin', now)
    .run();

  return json({ ok: true, id }, 200, { 'Cache-Control': 'no-cache, no-store, must-revalidate' });
}
