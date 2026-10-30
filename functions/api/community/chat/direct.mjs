// GET  /api/community/chat/direct?thread_id=&since= — direct thread messages
// POST /api/community/chat/direct — send direct message

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
  const requestedThreadId = (url.searchParams.get('thread_id') || '').trim();

  let targetMemberId;
  if (user.role === 'admin') {
    targetMemberId = requestedThreadId || user.id;
  } else {
    // Member can ONLY view their own direct thread with admin
    if (requestedThreadId && requestedThreadId !== user.id) {
      return forbidden("Members cannot access other members' private threads.");
    }
    targetMemberId = user.id;
  }

  let sql = `
    SELECT m.id, m.sender_user_id, m.recipient_user_id, m.text, m.is_deleted, m.created_at,
           p.name AS author_name, p.surname AS author_surname, p.avatar_id, p.role AS author_role
    FROM community_chat_messages m
    JOIN profiles p ON p.id = m.sender_user_id
    WHERE m.channel_type = 'direct'
      AND m.direct_thread_id = ?
      AND m.is_deleted = 0
  `;
  const params = [targetMemberId];
  if (since) {
    sql += ' AND m.created_at > ?';
    params.push(since);
  }
  sql += ' ORDER BY m.created_at ASC LIMIT ?';
  params.push(limit);

  const { results } = await env.DB.prepare(sql).bind(...params).all();

  const messages = (results || []).map((r) => ({
    id: r.id,
    sender_id: r.sender_user_id,
    is_me: r.sender_user_id === user.id,
    author_name: formatAuthorName(r.author_name, r.author_surname),
    author_role: r.author_role,
    avatar_id: r.avatar_id,
    text: r.text,
    created_at: r.created_at,
  }));

  // Update last_read_direct_at
  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO community_chat_members (user_id, last_read_direct_at, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET last_read_direct_at = excluded.last_read_direct_at, updated_at = excluded.updated_at`
  ).bind(user.id, now, now).run();

  return json(
    {
      ok: true,
      thread_id: targetMemberId,
      messages,
      last_timestamp: messages.length ? messages[messages.length - 1].created_at : since,
    },
    200,
    { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
  );
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;

  const body = await readJson(request);
  const text = String(body?.text || '').trim();
  if (!text) return badRequest('Message text is required');
  if (text.length > 1000) return badRequest('Message text cannot exceed 1000 characters');

  let threadId;
  let recipientId = null;

  if (user.role === 'admin') {
    threadId = String(body?.target_user_id || body?.thread_id || '').trim();
    if (!threadId) return badRequest('target_user_id is required for admin direct message');
    recipientId = threadId;
  } else {
    // Regular member replying in their thread with admin
    threadId = user.id;
    // Find an admin profile to assign as recipient
    const admin = await env.DB.prepare("SELECT id FROM profiles WHERE role = 'admin' LIMIT 1").first();
    recipientId = admin?.id || null;
  }

  const id = uuid();
  const now = nowIso();

  await env.DB.prepare(
    `INSERT INTO community_chat_messages (id, channel_type, direct_thread_id, sender_user_id, recipient_user_id, text, created_at, updated_at)
     VALUES (?, 'direct', ?, ?, ?, ?, ?, ?)`
  ).bind(id, threadId, user.id, recipientId, text, now, now).run();

  return json(
    {
      ok: true,
      message: {
        id,
        thread_id: threadId,
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
