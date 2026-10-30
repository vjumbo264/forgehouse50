// GET  /api/community/chat/messages?since=&limit= — group chat messages
// POST /api/community/chat/messages — send a group chat message

import { json, badRequest, forbidden, readJson, nowIso, uuid } from '../../../lib/http.mjs';
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

  const url = new URL(request.url);
  const since = (url.searchParams.get('since') || '').trim();
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));

  let sql = `
    SELECT m.id, m.sender_user_id, m.reply_to_message_id, m.text, m.is_deleted, m.created_at,
           p.name AS author_name, p.surname AS author_surname, p.avatar_id, p.role AS author_role,
           rm.text AS reply_to_text, rp.name AS reply_to_author_name, rp.surname AS reply_to_author_surname
    FROM community_chat_messages m
    JOIN profiles p ON p.id = m.sender_user_id
    LEFT JOIN community_chat_messages rm ON rm.id = m.reply_to_message_id
    LEFT JOIN profiles rp ON rp.id = rm.sender_user_id
    WHERE m.channel_type = 'group' AND m.is_deleted = 0
  `;
  const params = [];
  if (since) {
    sql += ' AND m.created_at > ?';
    params.push(since);
  }
  sql += ' ORDER BY m.created_at ASC LIMIT ?';
  params.push(limit);

  const { results } = await env.DB.prepare(sql).bind(...params).all();

  // Check current user's mute status
  const memberRow = await env.DB.prepare(
    'SELECT is_muted FROM community_chat_members WHERE user_id = ?'
  ).bind(user.id).first();

  const isMuted = memberRow?.is_muted === 1;

  const messages = (results || []).map((r) => ({
    id: r.id,
    sender_id: r.sender_user_id,
    is_me: r.sender_user_id === user.id,
    author_name: formatAuthorName(r.author_name, r.author_surname),
    author_role: r.author_role,
    avatar_id: r.avatar_id,
    text: r.text,
    created_at: r.created_at,
    reply_to: r.reply_to_message_id
      ? {
          id: r.reply_to_message_id,
          author_name: formatAuthorName(r.reply_to_author_name, r.reply_to_author_surname),
          text: (r.reply_to_text || '').slice(0, 100),
        }
      : null,
  }));

  // Update last_read_group_at
  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO community_chat_members (user_id, last_read_group_at, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET last_read_group_at = excluded.last_read_group_at, updated_at = excluded.updated_at`
  ).bind(user.id, now, now).run();

  return json(
    {
      ok: true,
      messages,
      is_muted: isMuted,
      last_timestamp: messages.length ? messages[messages.length - 1].created_at : since,
    },
    200,
    { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
  );
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;

  // Check if muted
  const memberRow = await env.DB.prepare(
    'SELECT is_muted FROM community_chat_members WHERE user_id = ?'
  ).bind(user.id).first();

  if (memberRow?.is_muted === 1) {
    return forbidden('You are currently muted from posting messages.');
  }

  const body = await readJson(request);
  const text = String(body?.text || '').trim();
  const replyToId = body?.reply_to_id ? String(body.reply_to_id).trim() : null;

  if (!text) return badRequest('Message text is required');
  if (text.length > 1000) return badRequest('Message text cannot exceed 1000 characters');

  // Basic rate limiting: max 30 messages in the last 60 seconds
  const recentCount = await env.DB.prepare(
    "SELECT COUNT(*) AS c FROM community_chat_messages WHERE sender_user_id = ? AND created_at > datetime('now', '-60 seconds')"
  ).bind(user.id).first();

  if ((recentCount?.c ?? 0) >= 30) {
    return forbidden('Rate limit exceeded. Please wait a moment before sending another message.');
  }

  const id = uuid();
  const now = nowIso();

  await env.DB.prepare(
    `INSERT INTO community_chat_messages (id, channel_type, direct_thread_id, sender_user_id, recipient_user_id, reply_to_message_id, text, created_at, updated_at)
     VALUES (?, 'group', NULL, ?, NULL, ?, ?, ?, ?)`
  ).bind(id, user.id, replyToId, text, now, now).run();

  return json(
    {
      ok: true,
      message: {
        id,
        sender_id: user.id,
        is_me: true,
        author_name: formatAuthorName(user.name, user.surname),
        author_role: user.role,
        avatar_id: user.avatar_id,
        text,
        created_at: now,
      },
    },
    201,
    { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
  );
}
