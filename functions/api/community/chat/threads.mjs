// GET /api/community/chat/threads — lists private direct threads, unread summary, and (for admins) privacy-safe member directory
import { json } from '../../../lib/http.mjs';
import { requireUser } from '../../../lib/auth.mjs';
import {
  EPOCH_ISO,
  formatMemberChatName,
  getChatUnreadSummary,
  isMemberMuted,
} from '../../../lib/chat.mjs';

const NO_CACHE = { 'Cache-Control': 'no-cache, no-store, must-revalidate' };

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;

  const isAdmin = user.role === 'admin';
  const muted = isAdmin ? false : await isMemberMuted(env.DB, user.id);
  const unread = await getChatUnreadSummary(env.DB, user);

  if (!isAdmin) {
    const lastMsg = await env.DB.prepare(
      `SELECT text, created_at, sender_role, sender_display_name
       FROM community_chat_messages
       WHERE channel_type = 'direct' AND direct_thread_id = ? AND is_deleted = 0
       ORDER BY created_at DESC, rowid DESC LIMIT 1`
    )
      .bind(user.id)
      .first();

    if (!lastMsg) {
      return json(
        {
          ok: true,
          is_muted: muted,
          unread,
          threads: [],
        },
        200,
        NO_CACHE
      );
    }

    const adminNameRow = await env.DB.prepare(
      `SELECT sender_display_name
       FROM community_chat_messages
       WHERE channel_type = 'direct' AND direct_thread_id = ? AND sender_role = 'admin' AND is_deleted = 0
       ORDER BY created_at DESC LIMIT 1`
    )
      .bind(user.id)
      .first();

    return json(
      {
        ok: true,
        is_muted: muted,
        unread,
        threads: [
          {
            thread_id: user.id,
            user_id: user.id,
            title: adminNameRow?.sender_display_name || 'Pastor Dave',
            subtitle: 'ForgeHouse Leadership',
            avatar_id: null,
            picture_version: null,
            is_muted: muted,
            unread_count: unread.direct_unread,
            latest_message: lastMsg.text,
            latest_timestamp: lastMsg.created_at,
          },
        ],
      },
      200,
      NO_CACHE
    );
  }

  // Admin view: active member threads + privacy-safe verified member directory for starting new threads
  const { results: threadRows } = await env.DB.prepare(
    `SELECT
       p.id AS user_id,
       p.name,
       p.surname,
       p.avatar_id,
       pic.version AS picture_version,
       COALESCE(cm.is_muted, 0) AS is_muted,
       (SELECT m.text FROM community_chat_messages m
        WHERE m.channel_type = 'direct' AND m.direct_thread_id = p.id AND m.is_deleted = 0
        ORDER BY m.created_at DESC, m.rowid DESC LIMIT 1) AS latest_message,
       (SELECT m.created_at FROM community_chat_messages m
        WHERE m.channel_type = 'direct' AND m.direct_thread_id = p.id AND m.is_deleted = 0
        ORDER BY m.created_at DESC, m.rowid DESC LIMIT 1) AS latest_timestamp,
       (SELECT COUNT(*) FROM community_chat_messages m
        WHERE m.channel_type = 'direct'
          AND m.direct_thread_id = p.id
          AND m.sender_user_id != ?
          AND m.is_deleted = 0
          AND m.created_at > COALESCE(
            (SELECT tr.last_read_at FROM community_chat_thread_reads tr WHERE tr.reader_id = ? AND tr.thread_id = p.id),
            ?
          )) AS unread_count
     FROM profiles p
     LEFT JOIN profile_pictures pic ON pic.user_id = p.id
     LEFT JOIN community_chat_members cm ON cm.user_id = p.id
     WHERE EXISTS (
       SELECT 1 FROM community_chat_messages m
       WHERE m.channel_type = 'direct' AND m.direct_thread_id = p.id AND m.is_deleted = 0
     )
     ORDER BY latest_timestamp DESC`
  )
    .bind(user.id, user.id, EPOCH_ISO)
    .all();

  const threads = (threadRows || []).map((r) => ({
    thread_id: r.user_id,
    user_id: r.user_id,
    title: formatMemberChatName(r.name, r.surname),
    subtitle: 'Member',
    avatar_id: r.avatar_id || null,
    picture_version: r.picture_version ?? null,
    is_muted: r.is_muted === 1,
    unread_count: Number(r.unread_count ?? 0),
    latest_message: r.latest_message || null,
    latest_timestamp: r.latest_timestamp || null,
  }));

  const { results: dirRows } = await env.DB.prepare(
    `SELECT
       p.id AS user_id,
       p.name,
       p.surname,
       p.avatar_id,
       pic.version AS picture_version,
       COALESCE(cm.is_muted, 0) AS is_muted
     FROM profiles p
     LEFT JOIN profile_pictures pic ON pic.user_id = p.id
     LEFT JOIN community_chat_members cm ON cm.user_id = p.id
     WHERE p.email_verified = 1
     ORDER BY p.name COLLATE NOCASE ASC, p.surname COLLATE NOCASE ASC`
  ).all();

  const directory = (dirRows || []).map((r) => ({
    user_id: r.user_id,
    title: formatMemberChatName(r.name, r.surname),
    avatar_id: r.avatar_id || null,
    picture_version: r.picture_version ?? null,
    is_muted: r.is_muted === 1,
  }));

  return json(
    {
      ok: true,
      is_muted: false,
      unread,
      threads,
      directory,
    },
    200,
    NO_CACHE
  );
}
