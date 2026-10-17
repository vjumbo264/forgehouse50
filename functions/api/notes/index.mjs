// GET  /api/notes — list OWN notes (search + type/day filters), user-scoped.
// POST /api/notes — create a note, award observation/question points idempotently.
// PUT  /api/notes — update fallback for clients that PUT /api/notes with ?id= or body.id.
// PATCH /api/notes — patch fallback.
// Observations, Questions, Prayers, and Applications are delivered to leaders' inbox.
// Insights stay completely private (never inboxed, never shared).

import { json, badRequest, notFound, forbidden, readJson, uuid, nowIso } from '../../lib/http.mjs';
import { requireUser } from '../../lib/auth.mjs';
import { awardPoints } from '../../lib/points.mjs';

const TYPES = ['observation', 'question', 'scripture_connection', 'insight', 'application', 'prayer'];
const LEADER_TYPES = ['observation', 'question', 'prayer', 'application'];

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;

  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim();
  const type = (url.searchParams.get('type') || '').trim().toLowerCase();
  const day = parseInt(url.searchParams.get('day') || '0', 10);

  let sql = `
    SELECT n.id, n.note_type, n.body, n.book, n.chapter, n.verse, n.day_number, n.created_at, n.updated_at,
           li.id AS inbox_id, li.status AS inbox_status, li.show_name, li.allow_group_share,
           li.first_sent_at, li.sent_at,
           cr.text AS reply_text, cr.created_at AS reply_created_at
    FROM notes n
    LEFT JOIN leader_inbox li ON li.note_id = n.id
    LEFT JOIN community_replies cr ON cr.inbox_id = li.id
    WHERE n.user_id = ?
  `;
  const params = [user.id];

  if (type && TYPES.includes(type)) {
    sql += ' AND n.note_type = ?';
    params.push(type);
  }
  if (day >= 1 && day <= 50) {
    sql += ' AND n.day_number = ?';
    params.push(day);
  }
  if (q) {
    sql += ' AND (n.body LIKE ? OR n.book LIKE ?)';
    params.push(`%${q}%`, `%${q}%`);
  }

  sql += ' ORDER BY n.updated_at DESC LIMIT 200';

  const { results } = await env.DB.prepare(sql).bind(...params).all();

  const notes = (results || []).map(r => {
    const isLeaderVisible = LEADER_TYPES.includes(r.note_type);
    return {
      id: r.id,
      note_type: r.note_type,
      body: r.body,
      book: r.book,
      chapter: r.chapter,
      verse: r.verse,
      day_number: r.day_number,
      created_at: r.created_at,
      updated_at: r.updated_at,
      sent_to_leaders: isLeaderVisible,
      inbox_status: isLeaderVisible ? (r.inbox_status || 'new') : null,
      show_name: r.show_name === 1,
      allow_group_share: r.allow_group_share === 1,
      first_sent_at: r.first_sent_at || (isLeaderVisible ? r.created_at : null),
      sent_at: r.sent_at || (isLeaderVisible ? r.updated_at : null),
      reply: r.reply_text ? {
        text: r.reply_text,
        created_at: r.reply_created_at,
        replied_at: r.reply_created_at
      } : null
    };
  });

  return json({ notes, total: notes.length });
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;

  const body = await readJson(request);
  const noteType = String(body?.note_type || '').trim().toLowerCase();
  const text = String(body?.body || '').trim();
  const book = String(body?.book || '').trim();
  const chapter = parseInt(body?.chapter ?? 0, 10);
  const verse = body?.verse != null ? parseInt(body.verse, 10) : null;
  const dayNumber = body?.day_number != null ? parseInt(body.day_number, 10) : null;
  const showName = (body?.show_name === true || body?.show_name === 1 || body?.show_name === '1') ? 1 : 0;
  const allowGroupShare = (body?.allow_group_share === true || body?.allow_group_share === 1 || body?.allow_group_share === '1') ? 1 : 0;

  if (!TYPES.includes(noteType)) return badRequest(`note_type must be one of: ${TYPES.join(', ')}`);
  if (!text || text.length > 5000) return badRequest('Note text is required (max 5000 chars)');
  if (!book || !chapter) return badRequest('book and chapter are required');
  if (dayNumber != null && (dayNumber < 1 || dayNumber > 50)) return badRequest('day_number must be 1–50');

  // Rate limit: 30 submissions per user per day
  const todayStart = new Date().toISOString().slice(0, 10);
  const countRow = await env.DB.prepare(
    "SELECT COUNT(*) AS c FROM notes WHERE user_id = ? AND created_at >= ?"
  ).bind(user.id, todayStart).first();
  if ((countRow?.c ?? 0) >= 30) {
    return badRequest('Daily note submission limit reached (30 notes per day)');
  }

  const id = uuid();
  const now = nowIso();

  await env.DB.prepare(
    `INSERT INTO notes (id, user_id, note_type, body, book, chapter, verse, day_number, created_at, updated_at) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, user.id, noteType, text, book, chapter, verse, dayNumber, now, now).run();

  // If Observation, Question, Prayer, or Application: copy to leader_inbox
  // Insight is explicitly excluded.
  if (LEADER_TYPES.includes(noteType)) {
    const ref = `${book} ${chapter}${verse ? ':' + verse : ''}`.trim();
    await env.DB.prepare(
      `INSERT INTO leader_inbox (id, note_id, author_user_id, type, reference, text, show_name, allow_group_share, status, first_sent_at, sent_at, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?)`
    ).bind(uuid(), id, user.id, noteType, ref, text, showName, allowGroupShare, now, now, now, now).run();
  }

  // Points: +2 per observation/question note, exactly once per note id.
  let awarded = 0;
  if (noteType === 'observation') {
    awarded = (await awardPoints(env.DB, user.id, 'observation_saved', `observation_saved:${user.id}:${id}`, { dayNumber })).points;
  } else if (noteType === 'question') {
    awarded = (await awardPoints(env.DB, user.id, 'question_saved', `question_saved:${user.id}:${id}`, { dayNumber })).points;
  }

  return json({
    ok: true,
    id,
    note_type: noteType,
    sent_to_leaders: LEADER_TYPES.includes(noteType),
    points_awarded: awarded
  }, 201);
}

// Fallback handlers for PUT / PATCH to /api/notes (where older clients might send PUT with id in query/body)
async function handleUpdateFallback({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;

  const url = new URL(request.url);
  const body = await readJson(request);
  const id = url.searchParams.get('id') || body?.id;

  if (!id) {
    return badRequest('Note ID is required in URL query or request body');
  }

  // Delegate update
  const existingNote = await env.DB.prepare(
    'SELECT id, user_id, note_type, body, book, chapter, verse, created_at FROM notes WHERE id = ?'
  ).bind(id).first();

  if (!existingNote) return notFound('Note not found');
  if (existingNote.user_id !== user.id) return forbidden('You do not own this note');

  const text = body?.body != null ? String(body.body).trim() : existingNote.body;
  const noteType = body?.note_type != null ? String(body.note_type).trim().toLowerCase() : existingNote.note_type;
  const showName = body?.show_name != null
    ? (body.show_name === true || body.show_name === 1 || body.show_name === '1' ? 1 : 0)
    : null;
  const allowGroupShare = body?.allow_group_share != null
    ? (body.allow_group_share === true || body.allow_group_share === 1 || body.allow_group_share === '1' ? 1 : 0)
    : null;

  if (!text || text.length > 5000) return badRequest('Note text is required (max 5000 chars)');
  if (!TYPES.includes(noteType)) return badRequest(`note_type must be one of: ${TYPES.join(', ')}`);

  const now = nowIso();
  await env.DB.prepare(
    'UPDATE notes SET body = ?, note_type = ?, updated_at = ? WHERE id = ? AND user_id = ?'
  ).bind(text, noteType, now, id, user.id).run();

  const inboxItem = await env.DB.prepare(
    'SELECT id, text, show_name, allow_group_share FROM leader_inbox WHERE note_id = ?'
  ).bind(id).first();

  if (LEADER_TYPES.includes(noteType)) {
    if (inboxItem) {
      if (inboxItem.text !== text) {
        await env.DB.prepare(
          'INSERT INTO leader_inbox_versions (id, inbox_id, text, edited_at) VALUES (?, ?, ?, ?)'
        ).bind(uuid(), inboxItem.id, inboxItem.text, now).run();
      }
      const finalShowName = showName != null ? showName : inboxItem.show_name;
      const finalAllow = allowGroupShare != null ? allowGroupShare : (inboxItem.allow_group_share || 0);
      await env.DB.prepare(
        `UPDATE leader_inbox 
         SET text = ?, type = ?, show_name = ?, allow_group_share = ?, sent_at = ?, updated_at = ? 
         WHERE id = ?`
      ).bind(text, noteType, finalShowName, finalAllow, now, now, inboxItem.id).run();
    } else {
      const ref = `${existingNote.book} ${existingNote.chapter}${existingNote.verse ? ':' + existingNote.verse : ''}`.trim();
      await env.DB.prepare(
        `INSERT INTO leader_inbox (id, note_id, author_user_id, type, reference, text, show_name, allow_group_share, status, first_sent_at, sent_at, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?)`
      ).bind(uuid(), id, user.id, noteType, ref, text, showName != null ? showName : 0, allowGroupShare != null ? allowGroupShare : 0, existingNote.created_at || now, now, now, now).run();
    }
  } else if (noteType === 'insight') {
    if (inboxItem) {
      await env.DB.prepare('DELETE FROM leader_inbox WHERE id = ?').bind(inboxItem.id).run();
    }
  }

  return json({
    ok: true,
    id,
    note_type: noteType,
    body: text,
    sent_to_leaders: LEADER_TYPES.includes(noteType),
    updated_at: now
  });
}

export async function onRequestPut(context) {
  return handleUpdateFallback(context);
}

export async function onRequestPatch(context) {
  return handleUpdateFallback(context);
}
