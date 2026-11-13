// GET & POST /api/community/chat/messages — shared church-wide group chat
import { json, badRequest, forbidden, readJson, uuid } from '../../../lib/http.mjs';
import { requireUser } from '../../../lib/auth.mjs';
import {
  CHAT_MAX_MESSAGE_LENGTH,
  EPOCH_ISO,
  MESSAGE_SELECT_SQL,
  checkChatRateLimit,
  isMemberMuted,
  markGroupReadIfNewer,
  maxCursorTimestamp,
  resolveSenderDisplayName,
  serializeChatMessage,
} from '../../../lib/chat.mjs';

const NO_CACHE = { 'Cache-Control': 'no-cache, no-store, must-revalidate' };

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;

  const isAdmin = user.role === 'admin';
  const url = new URL(request.url);
  const since = (url.searchParams.get('since') || '').trim();
  const before = (url.searchParams.get('before') || '').trim();
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));
  const nowMs = typeof env.NOW_MS === 'number' ? env.NOW_MS : Date.now();
  const nowStr = new Date(nowMs).toISOString();

  const muted = isAdmin ? false : await isMemberMuted(env.DB, user.id);

  // Mode 1: Incremental cursor poll (?since=...) — catches both new messages and soft-delete updates
  if (since) {
    const { results } = await env.DB.prepare(
      `${MESSAGE_SELECT_SQL}
       WHERE m.channel_type = 'group' AND (m.created_at > ? OR m.updated_at > ?)
       ORDER BY m.created_at ASC, m.rowid ASC
       LIMIT ?`
    )
      .bind(since, since, limit)
      .all();

    const rows = results || [];
    const messages = rows.map((r) => serializeChatMessage(r, user.id, isAdmin));
    const latestUnreadTs = rows
      .filter((r) => r.is_deleted !== 1)
      .reduce((acc, r) => (!acc || r.created_at > acc ? r.created_at : acc), null);
    if (latestUnreadTs) {
      await markGroupReadIfNewer(env.DB, user.id, latestUnreadTs, nowStr);
    }
    const nextCursor = maxCursorTimestamp(rows, since);

    return json(
      {
        ok: true,
        messages,
        deleted_ids: [],
        has_older: false,
        oldest_timestamp: messages.length > 0 ? messages[0].created_at : null,
        last_timestamp: nextCursor,
        is_muted: muted,
      },
      200,
      NO_CACHE
    );
  }

  // Mode 2: Older history pagination (?before=...)
  if (before) {
    const { results } = await env.DB.prepare(
      `${MESSAGE_SELECT_SQL}
       WHERE m.channel_type = 'group' AND m.created_at < ?
       ORDER BY m.created_at DESC, m.rowid DESC
       LIMIT ?`
    )
      .bind(before, limit + 1)
      .all();

    const rows = results || [];
    const hasOlder = rows.length > limit;
    const chronological = (hasOlder ? rows.slice(0, limit) : rows).reverse();
    const messages = chronological.map((r) => serializeChatMessage(r, user.id, isAdmin));

    return json(
      {
        ok: true,
        messages,
        deleted_ids: [],
        has_older: hasOlder,
        oldest_timestamp: messages.length > 0 ? messages[0].created_at : null,
        last_timestamp: maxCursorTimestamp(chronological, EPOCH_ISO),
        is_muted: muted,
      },
      200,
      NO_CACHE
    );
  }

  // Mode 3: Initial latest page (newest N in chronological order: oldest at top, newest at bottom)
  const { results } = await env.DB.prepare(
    `${MESSAGE_SELECT_SQL}
     WHERE m.channel_type = 'group'
     ORDER BY m.created_at DESC, m.rowid DESC
     LIMIT ?`
  )
    .bind(limit + 1)
    .all();

  const rows = results || [];
  const hasOlder = rows.length > limit;
  const chronological = (hasOlder ? rows.slice(0, limit) : rows).reverse();
  const messages = chronological.map((r) => serializeChatMessage(r, user.id, isAdmin));
  const latestUnreadTs = chronological
    .filter((r) => r.is_deleted !== 1)
    .reduce((acc, r) => (!acc || r.created_at > acc ? r.created_at : acc), null);
  if (latestUnreadTs) {
    await markGroupReadIfNewer(env.DB, user.id, latestUnreadTs, nowStr);
  }

  return json(
    {
      ok: true,
      messages,
      deleted_ids: [],
      has_older: hasOlder,
      oldest_timestamp: messages.length > 0 ? messages[0].created_at : null,
      last_timestamp: maxCursorTimestamp(chronological, EPOCH_ISO),
      is_muted: muted,
    },
    200,
    NO_CACHE
  );
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;

  const isAdmin = user.role === 'admin';
  const nowMs = typeof env.NOW_MS === 'number' ? env.NOW_MS : Date.now();
  const nowStr = new Date(nowMs).toISOString();

  if (!isAdmin) {
    const muted = await isMemberMuted(env.DB, user.id);
    if (muted) {
      return forbidden('You have been muted by an administrator and cannot send messages.');
    }
  }

  const body = await readJson(request);
  const text = String(body?.text || '').trim();
  const replyToId = body?.reply_to_id ? String(body.reply_to_id).trim() : null;
  const clientMsgId = body?.client_msg_id ? String(body.client_msg_id).trim().slice(0, 80) : null;

  if (!text) return badRequest('Message text is required');
  if (text.length > CHAT_MAX_MESSAGE_LENGTH) {
    return badRequest(`Message text cannot exceed ${CHAT_MAX_MESSAGE_LENGTH} characters`);
  }

  // Optimistic send deduplication (k3): retry with same client_msg_id returns original message without duplicating
  if (clientMsgId) {
    const existing = await env.DB.prepare(
      `${MESSAGE_SELECT_SQL} WHERE m.sender_user_id = ? AND m.client_msg_id = ? LIMIT 1`
    )
      .bind(user.id, clientMsgId)
      .first();
    if (existing) {
      return json(
        {
          ok: true,
          deduplicated: true,
          message: serializeChatMessage(existing, user.id, isAdmin),
        },
        200,
        NO_CACHE
      );
    }
  }

  if (replyToId) {
    const targetMsg = await env.DB.prepare(
      "SELECT id FROM community_chat_messages WHERE id = ? AND channel_type = 'group'"
    )
      .bind(replyToId)
      .first();
    if (!targetMsg) {
      return badRequest('Replied message not found');
    }
  }

  const rate = await checkChatRateLimit(env.DB, user.id, nowMs);
  if (!rate.allowed) {
    return json(
      { error: 'Rate limit exceeded. Please wait a moment before sending another message.' },
      429,
      NO_CACHE
    );
  }

  const id = uuid();
  const senderRole = isAdmin ? 'admin' : 'member';
  const senderDisplayName = await resolveSenderDisplayName(env.DB, user);

  await env.DB.prepare(
    `INSERT INTO community_chat_messages (
       id, channel_type, direct_thread_id, sender_user_id, sender_role,
       sender_display_name, recipient_user_id, reply_to_message_id, text, client_msg_id, created_at, updated_at
     ) VALUES (?, 'group', NULL, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`
  )
    .bind(id, user.id, senderRole, senderDisplayName, replyToId, text, clientMsgId, nowStr, nowStr)
    .run();

  await markGroupReadIfNewer(env.DB, user.id, nowStr, nowStr);

  const inserted = await env.DB.prepare(`${MESSAGE_SELECT_SQL} WHERE m.id = ?`).bind(id).first();
  return json(
    {
      ok: true,
      message: serializeChatMessage(inserted, user.id, isAdmin),
    },
    201,
    NO_CACHE
  );
}
