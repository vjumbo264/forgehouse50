// GET & POST /api/community/chat/messages — shared church-wide group chat
import { json, badRequest, forbidden, readJson, uuid } from '../../../lib/http.mjs';
import { requireUser } from '../../../lib/auth.mjs';
import {
  CHAT_MAX_MESSAGE_LENGTH,
  MESSAGE_SELECT_SQL,
  checkChatRateLimit,
  isMemberMuted,
  markGroupReadIfNewer,
  resolveSenderDisplayName,
  serializeChatMessage,
} from '../../../lib/chat.mjs';

const NO_CACHE = { 'Cache-Control': 'no-cache, no-store, must-revalidate' };

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;

  const url = new URL(request.url);
  const since = (url.searchParams.get('since') || '').trim();
  const before = (url.searchParams.get('before') || '').trim();
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));
  const nowMs = typeof env.NOW_MS === 'number' ? env.NOW_MS : Date.now();
  const nowStr = new Date(nowMs).toISOString();

  const muted = user.role === 'admin' ? false : await isMemberMuted(env.DB, user.id);

  // Mode 1: Incremental cursor poll (?since=...)
  if (since) {
    const { results } = await env.DB.prepare(
      `${MESSAGE_SELECT_SQL}
       WHERE m.channel_type = 'group' AND m.is_deleted = 0 AND m.created_at > ?
       ORDER BY m.created_at ASC, m.rowid ASC
       LIMIT ?`
    )
      .bind(since, limit)
      .all();

    const { results: delRows } = await env.DB.prepare(
      `SELECT id FROM community_chat_messages
       WHERE channel_type = 'group' AND is_deleted = 1 AND updated_at > ?
       LIMIT 100`
    )
      .bind(since)
      .all();

    const messages = (results || []).map((r) => serializeChatMessage(r, user.id));
    const deletedIds = (delRows || []).map((r) => r.id);
    const latestTs = messages.length > 0 ? messages[messages.length - 1].created_at : null;

    if (latestTs) {
      await markGroupReadIfNewer(env.DB, user.id, latestTs, nowStr);
    }

    return json(
      {
        ok: true,
        messages,
        deleted_ids: deletedIds,
        has_older: false,
        oldest_timestamp: messages.length > 0 ? messages[0].created_at : null,
        last_timestamp: latestTs || since,
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
       WHERE m.channel_type = 'group' AND m.is_deleted = 0 AND m.created_at < ?
       ORDER BY m.created_at DESC, m.rowid DESC
       LIMIT ?`
    )
      .bind(before, limit + 1)
      .all();

    const rows = results || [];
    const hasOlder = rows.length > limit;
    const chronological = (hasOlder ? rows.slice(0, limit) : rows).reverse();
    const messages = chronological.map((r) => serializeChatMessage(r, user.id));

    return json(
      {
        ok: true,
        messages,
        deleted_ids: [],
        has_older: hasOlder,
        oldest_timestamp: messages.length > 0 ? messages[0].created_at : null,
        last_timestamp: messages.length > 0 ? messages[messages.length - 1].created_at : null,
        is_muted: muted,
      },
      200,
      NO_CACHE
    );
  }

  // Mode 3: Initial latest page (newest N in chronological order: oldest at top, newest at bottom)
  const { results } = await env.DB.prepare(
    `${MESSAGE_SELECT_SQL}
     WHERE m.channel_type = 'group' AND m.is_deleted = 0
     ORDER BY m.created_at DESC, m.rowid DESC
     LIMIT ?`
  )
    .bind(limit + 1)
    .all();

  const rows = results || [];
  const hasOlder = rows.length > limit;
  const chronological = (hasOlder ? rows.slice(0, limit) : rows).reverse();
  const messages = chronological.map((r) => serializeChatMessage(r, user.id));
  const latestTs = messages.length > 0 ? messages[messages.length - 1].created_at : null;

  if (latestTs) {
    await markGroupReadIfNewer(env.DB, user.id, latestTs, nowStr);
  }

  return json(
    {
      ok: true,
      messages,
      deleted_ids: [],
      has_older: hasOlder,
      oldest_timestamp: messages.length > 0 ? messages[0].created_at : null,
      last_timestamp: latestTs,
      is_muted: muted,
    },
    200,
    NO_CACHE
  );
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;

  const nowMs = typeof env.NOW_MS === 'number' ? env.NOW_MS : Date.now();
  const nowStr = new Date(nowMs).toISOString();

  if (user.role !== 'admin') {
    const muted = await isMemberMuted(env.DB, user.id);
    if (muted) {
      return forbidden('You have been muted by an administrator and cannot send messages.');
    }
  }

  const body = await readJson(request);
  const text = String(body?.text || '').trim();
  const replyToId = body?.reply_to_id ? String(body.reply_to_id).trim() : null;

  if (!text) return badRequest('Message text is required');
  if (text.length > CHAT_MAX_MESSAGE_LENGTH) {
    return badRequest(`Message text cannot exceed ${CHAT_MAX_MESSAGE_LENGTH} characters`);
  }

  if (replyToId) {
    const targetMsg = await env.DB.prepare(
      "SELECT id FROM community_chat_messages WHERE id = ? AND channel_type = 'group' AND is_deleted = 0"
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
  const senderRole = user.role === 'admin' ? 'admin' : 'member';
  const senderDisplayName = await resolveSenderDisplayName(env.DB, user);

  await env.DB.prepare(
    `INSERT INTO community_chat_messages (
       id, channel_type, direct_thread_id, sender_user_id, sender_role,
       sender_display_name, recipient_user_id, reply_to_message_id, text, created_at, updated_at
     ) VALUES (?, 'group', NULL, ?, ?, ?, NULL, ?, ?, ?, ?)`
  )
    .bind(id, user.id, senderRole, senderDisplayName, replyToId, text, nowStr, nowStr)
    .run();

  await markGroupReadIfNewer(env.DB, user.id, nowStr, nowStr);

  const inserted = await env.DB.prepare(`${MESSAGE_SELECT_SQL} WHERE m.id = ?`).bind(id).first();

  return json(
    {
      ok: true,
      message: serializeChatMessage(inserted, user.id),
    },
    201,
    NO_CACHE
  );
}
