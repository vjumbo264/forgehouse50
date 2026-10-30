// GET /api/community/chat/threads — lists direct threads and unread counts
import { json } from '../../../lib/http.mjs';
import { requireUser } from '../../../lib/auth.mjs';

function formatAuthorName(name, surname) {
  const given = (name || '').trim();
  const sur = (surname || '').trim();
  if (given && sur) {
    return `${given} ${sur[0].toUpperCase()}.`;
  }
  return given || 'Member';
}

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;

  const isAdmin = user.role === 'admin';

  if (!isAdmin) {
    // Single thread for member
    const memberRow = await env.DB.prepare(
      'SELECT last_read_direct_at FROM community_chat_members WHERE user_id = ?'
    ).bind(user.id).first();
    const lastRead = memberRow?.last_read_direct_at || '1970-01-01T00:00:00Z';

    const unread = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM community_chat_messages
       WHERE channel_type = 'direct' AND direct_thread_id = ? AND sender_user_id != ? AND created_at > ? AND is_deleted = 0`
    ).bind(user.id, user.id, lastRead).first();

    const lastMsg = await env.DB.prepare(
      `SELECT text, created_at FROM community_chat_messages
       WHERE channel_type = 'direct' AND direct_thread_id = ? AND is_deleted = 0
       ORDER BY created_at DESC LIMIT 1`
    ).bind(user.id).first();

    return json({
      ok: true,
      threads: [
        {
          thread_id: user.id,
          title: 'Direct message from Pastor Dave / Leadership',
          unread_count: unread?.c ?? 0,
          latest_message: lastMsg?.text ?? null,
          latest_timestamp: lastMsg?.created_at ?? null,
        },
      ],
    }, 200, { 'Cache-Control': 'no-cache, no-store, must-revalidate' });
  }

  // Admin view: list all member threads
  const { results } = await env.DB.prepare(`
    SELECT p.id AS user_id, p.name, p.surname, p.avatar_id,
           (SELECT text FROM community_chat_messages m WHERE m.channel_type = 'direct' AND m.direct_thread_id = p.id AND m.is_deleted = 0 ORDER BY m.created_at DESC LIMIT 1) AS latest_message,
           (SELECT created_at FROM community_chat_messages m WHERE m.channel_type = 'direct' AND m.direct_thread_id = p.id AND m.is_deleted = 0 ORDER BY m.created_at DESC LIMIT 1) AS latest_timestamp,
           (SELECT COUNT(*) FROM community_chat_messages m WHERE m.channel_type = 'direct' AND m.direct_thread_id = p.id AND m.sender_user_id != ? AND m.is_deleted = 0 AND m.created_at > COALESCE((SELECT last_read_direct_at FROM community_chat_members cm WHERE cm.user_id = ?), '1970-01-01')) AS unread_count
    FROM profiles p
    WHERE p.role != 'admin'
      AND EXISTS (SELECT 1 FROM community_chat_messages m WHERE m.channel_type = 'direct' AND m.direct_thread_id = p.id)
    ORDER BY latest_timestamp DESC
  `).bind(user.id, user.id).all();

  const threads = (results || []).map((r) => ({
    thread_id: r.user_id,
    user_id: r.user_id,
    title: formatAuthorName(r.name, r.surname),
    avatar_id: r.avatar_id,
    unread_count: r.unread_count || 0,
    latest_message: r.latest_message || null,
    latest_timestamp: r.latest_timestamp || null,
  }));

  return json({ ok: true, threads }, 200, { 'Cache-Control': 'no-cache, no-store, must-revalidate' });
}
