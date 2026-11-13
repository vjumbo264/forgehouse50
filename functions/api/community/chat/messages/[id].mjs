// DELETE /api/community/chat/messages/:id — soft delete own message (member) or any message (admin) (k5)
import { json, forbidden, notFound, uuid } from '../../../../lib/http.mjs';
import { requireUser } from '../../../../lib/auth.mjs';
import { MESSAGE_SELECT_SQL, serializeChatMessage } from '../../../../lib/chat.mjs';

const NO_CACHE = { 'Cache-Control': 'no-cache, no-store, must-revalidate' };

function messageId(request) {
  const parts = new URL(request.url).pathname.split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

export async function onRequestDelete({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;

  const id = messageId(request);
  const existing = await env.DB.prepare(
    'SELECT id, sender_user_id, is_deleted FROM community_chat_messages WHERE id = ?'
  )
    .bind(id)
    .first();

  if (!existing) {
    return notFound('Message not found');
  }

  const isAdmin = user.role === 'admin';
  if (!isAdmin && existing.sender_user_id !== user.id) {
    return forbidden('You can only delete your own messages.');
  }

  const nowMs = typeof env.NOW_MS === 'number' ? env.NOW_MS : Date.now();
  const nowStr = new Date(nowMs).toISOString();

  if (existing.is_deleted !== 1) {
    await env.DB.prepare(
      'UPDATE community_chat_messages SET is_deleted = 1, deleted_by = ?, deleted_at = ?, updated_at = ? WHERE id = ?'
    )
      .bind(user.id, nowStr, nowStr, id)
      .run();

    if (isAdmin && existing.sender_user_id !== user.id) {
      await env.DB.prepare(
        "INSERT INTO admin_audit (id, admin_id, action, target_user_id, target_display_name, created_at) VALUES (?, ?, 'chat_message_delete', ?, ?, ?)"
      )
        .bind(uuid(), user.id, id, user.username || 'admin', nowStr)
        .run();
    }
  }

  const row = await env.DB.prepare(`${MESSAGE_SELECT_SQL} WHERE m.id = ?`).bind(id).first();
  return json(
    {
      ok: true,
      id,
      deleted_at: row?.deleted_at || nowStr,
      message: row ? serializeChatMessage(row, user.id, isAdmin) : null,
    },
    200,
    NO_CACHE
  );
}
