// GET & POST /api/community/chat/direct — private 1:1 thread between admin and a single member
import { json, badRequest, forbidden, notFound, readJson, uuid } from '../../../lib/http.mjs';
import { requireUser } from '../../../lib/auth.mjs';
import {
  CHAT_MAX_MESSAGE_LENGTH,
  MESSAGE_SELECT_SQL,
  checkChatRateLimit,
  formatMemberChatName,
  isMemberMuted,
  markDirectThreadReadIfNewer,
  resolveSenderDisplayName,
  serializeChatMessage,
} from '../../../lib/chat.mjs';

const NO_CACHE = { 'Cache-Control': 'no-cache, no-store, must-revalidate' };

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;

  const url = new URL(request.url);
  const requestedThreadId = (url.searchParams.get('thread_id') || '').trim();
  const since = (url.searchParams.get('since') || '').trim();
  const before = (url.searchParams.get('before') || '').trim();
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));
  const nowMs = typeof env.NOW_MS === 'number' ? env.NOW_MS : Date.now();
  const nowStr = new Date(nowMs).toISOString();

  let threadId;
  let threadTitle = 'Pastor Dave';

  if (user.role === 'admin') {
    if (!requestedThreadId) return badRequest('thread_id is required for admin');
    const memberProfile = await env.DB.prepare(
      'SELECT id, name, surname FROM profiles WHERE id = ?'
    )
      .bind(requestedThreadId)
      .first();
    if (!memberProfile) return notFound('Member not found');
    threadId = memberProfile.id;
    threadTitle = formatMemberChatName(memberProfile.name, memberProfile.surname);
  } else {
    if (requestedThreadId && requestedThreadId !== user.id) {
      return forbidden('Cannot access another member private thread');
    }
    threadId = user.id;
  }

  const muted = user.role === 'admin' ? false : await isMemberMuted(env.DB, user.id);
  const startedRow = await env.DB.prepare(
    `SELECT 1 AS started FROM community_chat_messages
     WHERE channel_type = 'direct' AND direct_thread_id = ? AND sender_role = 'admin' AND is_deleted = 0
     LIMIT 1`
  )
    .bind(threadId)
    .first();
  const threadStartedByAdmin = !!startedRow;

  if (since) {
    const { results } = await env.DB.prepare(
      `${MESSAGE_SELECT_SQL}
       WHERE m.channel_type = 'direct' AND m.direct_thread_id = ? AND m.is_deleted = 0 AND m.created_at > ?
       ORDER BY m.created_at ASC, m.rowid ASC
       LIMIT ?`
    )
      .bind(threadId, since, limit)
      .all();

    const { results: delRows } = await env.DB.prepare(
      `SELECT id FROM community_chat_messages
       WHERE channel_type = 'direct' AND direct_thread_id = ? AND is_deleted = 1 AND updated_at > ?
       LIMIT 100`
    )
      .bind(threadId, since)
      .all();

    const messages = (results || []).map((r) => serializeChatMessage(r, user.id));
    const deletedIds = (delRows || []).map((r) => r.id);
    const latestTs = messages.length > 0 ? messages[messages.length - 1].created_at : null;

    if (latestTs) {
      await markDirectThreadReadIfNewer(env.DB, user.id, threadId, latestTs, nowStr);
    }

    return json(
      {
        ok: true,
        thread_id: threadId,
        thread_title: threadTitle,
        thread_started_by_admin: threadStartedByAdmin,
        is_muted: muted,
        messages,
        deleted_ids: deletedIds,
        has_older: false,
        oldest_timestamp: messages.length > 0 ? messages[0].created_at : null,
        last_timestamp: latestTs || since,
      },
      200,
      NO_CACHE
    );
  }

  if (before) {
    const { results } = await env.DB.prepare(
      `${MESSAGE_SELECT_SQL}
       WHERE m.channel_type = 'direct' AND m.direct_thread_id = ? AND m.is_deleted = 0 AND m.created_at < ?
       ORDER BY m.created_at DESC, m.rowid DESC
       LIMIT ?`
    )
      .bind(threadId, before, limit + 1)
      .all();

    const rows = results || [];
    const hasOlder = rows.length > limit;
    const chronological = (hasOlder ? rows.slice(0, limit) : rows).reverse();
    const messages = chronological.map((r) => serializeChatMessage(r, user.id));

    return json(
      {
        ok: true,
        thread_id: threadId,
        thread_title: threadTitle,
        thread_started_by_admin: threadStartedByAdmin,
        is_muted: muted,
        messages,
        deleted_ids: [],
        has_older: hasOlder,
        oldest_timestamp: messages.length > 0 ? messages[0].created_at : null,
        last_timestamp: messages.length > 0 ? messages[messages.length - 1].created_at : null,
      },
      200,
      NO_CACHE
    );
  }

  const { results } = await env.DB.prepare(
    `${MESSAGE_SELECT_SQL}
     WHERE m.channel_type = 'direct' AND m.direct_thread_id = ? AND m.is_deleted = 0
     ORDER BY m.created_at DESC, m.rowid DESC
     LIMIT ?`
  )
    .bind(threadId, limit + 1)
    .all();

  const rows = results || [];
  const hasOlder = rows.length > limit;
  const chronological = (hasOlder ? rows.slice(0, limit) : rows).reverse();
  const messages = chronological.map((r) => serializeChatMessage(r, user.id));
  const latestTs = messages.length > 0 ? messages[messages.length - 1].created_at : null;

  if (latestTs) {
    await markDirectThreadReadIfNewer(env.DB, user.id, threadId, latestTs, nowStr);
  }

  return json(
    {
      ok: true,
      thread_id: threadId,
      thread_title: threadTitle,
      thread_started_by_admin: threadStartedByAdmin,
      is_muted: muted,
      messages,
      deleted_ids: [],
      has_older: hasOlder,
      oldest_timestamp: messages.length > 0 ? messages[0].created_at : null,
      last_timestamp: latestTs,
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

  const body = await readJson(request);
  const text = String(body?.text || '').trim();
  const replyToId = body?.reply_to_id ? String(body.reply_to_id).trim() : null;
  const explicitTarget = String(body?.target_user_id || body?.thread_id || '').trim();

  if (!text) return badRequest('Message text is required');
  if (text.length > CHAT_MAX_MESSAGE_LENGTH) {
    return badRequest(`Message text cannot exceed ${CHAT_MAX_MESSAGE_LENGTH} characters`);
  }

  let threadId;
  let recipientId = null;

  if (user.role === 'admin') {
    if (!explicitTarget) {
      return badRequest('target_user_id is required for admin direct message');
    }
    const targetMember = await env.DB.prepare('SELECT id FROM profiles WHERE id = ?')
      .bind(explicitTarget)
      .first();
    if (!targetMember) {
      return notFound('Target member not found');
    }
    threadId = targetMember.id;
    recipientId = targetMember.id;
  } else {
    // Member: strictly prohibited from targeting any other member
    if (explicitTarget && explicitTarget !== user.id) {
      return forbidden('Members cannot message other members privately.');
    }
    const muted = await isMemberMuted(env.DB, user.id);
    if (muted) {
      return forbidden('You have been muted by an administrator and cannot send messages.');
    }
    threadId = user.id;

    // Member can reply ONLY after an admin has started the private thread
    const startedRow = await env.DB.prepare(
      `SELECT 1 AS started FROM community_chat_messages
       WHERE channel_type = 'direct' AND direct_thread_id = ? AND sender_role = 'admin' AND is_deleted = 0
       LIMIT 1`
    )
      .bind(threadId)
      .first();
    if (!startedRow) {
      return forbidden('Direct conversations with leadership are started by an administrator.');
    }
  }

  if (replyToId) {
    const targetMsg = await env.DB.prepare(
      `SELECT id FROM community_chat_messages
       WHERE id = ? AND channel_type = 'direct' AND direct_thread_id = ? AND is_deleted = 0`
    )
      .bind(replyToId, threadId)
      .first();
    if (!targetMsg) {
      return badRequest('Replied message not found in this conversation');
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
     ) VALUES (?, 'direct', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, threadId, user.id, senderRole, senderDisplayName, recipientId, replyToId, text, nowStr, nowStr)
    .run();

  await markDirectThreadReadIfNewer(env.DB, user.id, threadId, nowStr, nowStr);

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
