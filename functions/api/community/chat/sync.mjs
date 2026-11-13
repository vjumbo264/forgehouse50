// GET /api/community/chat/sync — unified zero-write incremental chat & notification sync (k1, k7)
import { json } from '../../../lib/http.mjs';
import { requireUser } from '../../../lib/auth.mjs';
import {
  EPOCH_ISO,
  MESSAGE_SELECT_SQL,
  formatMemberChatName,
  getChatUnreadSummary,
  isMemberMuted,
  maxCursorTimestamp,
  serializeChatMessage,
} from '../../../lib/chat.mjs';

const NO_CACHE = { 'Cache-Control': 'no-cache, no-store, must-revalidate' };

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;

  const isAdmin = user.role === 'admin';
  const url = new URL(request.url);
  const unreadOnly = url.searchParams.get('unread_only') === '1';
  const bg = url.searchParams.get('bg') === '1';
  const groupSince = (url.searchParams.get('group_since') || '').trim();
  const directSince = (url.searchParams.get('direct_since') || '').trim();
  const threadIdParam = (url.searchParams.get('thread_id') || '').trim();
  const nowMs = typeof env.NOW_MS === 'number' ? env.NOW_MS : Date.now();
  const nowStr = new Date(nowMs).toISOString();

  const [muted, unread] = await Promise.all([
    isAdmin ? Promise.resolve(false) : isMemberMuted(env.DB, user.id),
    getChatUnreadSummary(env.DB, user),
  ]);

  if (unreadOnly) {
    return json(
      {
        ok: true,
        is_muted: muted,
        unread,
        server_time: nowStr,
      },
      200,
      NO_CACHE
    );
  }

  let groupMessages = [];
  let groupLastTs = groupSince || null;
  let directMessages = [];
  let directLastTs = directSince || null;

  if (bg) {
    // Background notification sync (k7): ONLY non-deleted messages from other users (never leaks deleted text)
    const gCursor = groupSince || EPOCH_ISO;
    const { results: gRows } = await env.DB.prepare(
      `${MESSAGE_SELECT_SQL}
       WHERE m.channel_type = 'group'
         AND m.is_deleted = 0
         AND m.sender_user_id != ?
         AND m.created_at > ?
       ORDER BY m.created_at ASC, m.rowid ASC
       LIMIT 15`
    )
      .bind(user.id, gCursor)
      .all();
    groupMessages = (gRows || []).map((r) => serializeChatMessage(r, user.id, isAdmin));
    groupLastTs = groupMessages.length > 0 ? groupMessages[groupMessages.length - 1].created_at : groupSince || nowStr;

    const dCursor = directSince || EPOCH_ISO;
    if (isAdmin) {
      const { results: dRows } = await env.DB.prepare(
        `SELECT
           m.id, m.channel_type, m.direct_thread_id, m.sender_user_id, m.sender_role,
           m.sender_display_name, m.reply_to_message_id, m.text, m.is_deleted, m.deleted_by,
           m.deleted_at, m.client_msg_id, m.created_at, m.updated_at,
           p.name AS profile_name, p.surname AS profile_surname, p.avatar_id AS profile_avatar_id,
           pic.version AS profile_picture_version,
           rm.id AS reply_id, rm.text AS reply_text, rm.is_deleted AS reply_is_deleted,
           rm.sender_role AS reply_sender_role, rm.sender_display_name AS reply_sender_display_name,
           rp.name AS reply_profile_name, rp.surname AS reply_profile_surname,
           tp.name AS thread_member_name, tp.surname AS thread_member_surname
         FROM community_chat_messages m
         LEFT JOIN profiles p ON p.id = m.sender_user_id
         LEFT JOIN profile_pictures pic ON pic.user_id = p.id
         LEFT JOIN community_chat_messages rm ON rm.id = m.reply_to_message_id
         LEFT JOIN profiles rp ON rp.id = rm.sender_user_id
         LEFT JOIN profiles tp ON tp.id = m.direct_thread_id
         WHERE m.channel_type = 'direct'
           AND m.is_deleted = 0
           AND m.sender_user_id != ?
           AND m.created_at > ?
         ORDER BY m.created_at ASC, m.rowid ASC
         LIMIT 15`
      )
        .bind(user.id, dCursor)
        .all();
      directMessages = (dRows || []).map((r) => ({
        ...serializeChatMessage(r, user.id, true),
        thread_title: r.thread_member_name
          ? formatMemberChatName(r.thread_member_name, r.thread_member_surname)
          : 'Member',
      }));
    } else {
      const { results: dRows } = await env.DB.prepare(
        `${MESSAGE_SELECT_SQL}
         WHERE m.channel_type = 'direct'
           AND m.direct_thread_id = ?
           AND m.is_deleted = 0
           AND m.sender_user_id != ?
           AND m.created_at > ?
         ORDER BY m.created_at ASC, m.rowid ASC
         LIMIT 15`
      )
        .bind(user.id, user.id, dCursor)
        .all();
      directMessages = (dRows || []).map((r) => ({
        ...serializeChatMessage(r, user.id, false),
        thread_title: 'ForgeHouse Leadership',
      }));
    }
    directLastTs = directMessages.length > 0 ? directMessages[directMessages.length - 1].created_at : directSince || nowStr;
  } else {
    // Active foreground chat sync: includes soft-deleted updates
    if (groupSince) {
      const { results: gRows } = await env.DB.prepare(
        `${MESSAGE_SELECT_SQL}
         WHERE m.channel_type = 'group' AND (m.created_at > ? OR m.updated_at > ?)
         ORDER BY m.created_at ASC, m.rowid ASC
         LIMIT 50`
      )
        .bind(groupSince, groupSince)
        .all();
      const rows = gRows || [];
      groupMessages = rows.map((r) => serializeChatMessage(r, user.id, isAdmin));
      groupLastTs = maxCursorTimestamp(rows, groupSince);
    }

    const activeThreadId = isAdmin ? threadIdParam : user.id;
    if (directSince && activeThreadId) {
      const { results: dRows } = await env.DB.prepare(
        `${MESSAGE_SELECT_SQL}
         WHERE m.channel_type = 'direct' AND m.direct_thread_id = ? AND (m.created_at > ? OR m.updated_at > ?)
         ORDER BY m.created_at ASC, m.rowid ASC
         LIMIT 50`
      )
        .bind(activeThreadId, directSince, directSince)
        .all();
      const rows = dRows || [];
      directMessages = rows.map((r) => serializeChatMessage(r, user.id, isAdmin));
      directLastTs = maxCursorTimestamp(rows, directSince);
    }
  }

  return json(
    {
      ok: true,
      is_muted: muted,
      unread,
      server_time: nowStr,
      group_messages: groupMessages,
      group_last_ts: groupLastTs,
      direct_messages: directMessages,
      direct_last_ts: directLastTs,
    },
    200,
    NO_CACHE
  );
}
