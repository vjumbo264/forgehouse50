// GET  /api/notes — list OWN notes (search + type/day filters), user-scoped.
// POST /api/notes — create a note, award observation/question points idempotently.
// Observation and Question notes are ALWAYS delivered to the leaders inbox.
import { json, badRequest, readJson, uuid, nowIso } from '../../lib/http.mjs';
import { requireUser } from '../../lib/auth.mjs';
import { awardPoints } from '../../lib/points.mjs';

const TYPES = ['observation', 'question', 'scripture_connection', 'insight', 'application', 'prayer'];

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;

  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim();
  const type = url.searchParams.get('type') || '';
  const day = parseInt(url.searchParams.get('day') || '0', 10);

  let sql = `
    SELECT n.id, n.note_type, n.body, n.book, n.chapter, n.verse, n.day_number, n.created_at, n.updated_at,
           li.id AS inbox_id, li.status AS inbox_status, li.show_name,
           cr.text AS reply_text, cr.created_at AS reply_created_at
    FROM notes n
    LEFT JOIN leader_inbox li ON li.note_id = n.id
    LEFT JOIN community_replies cr ON cr.inbox_id = li.id
    WHERE n.user_id = ?
  `;
  const params = [user.id];

  if (type && TYPES.includes(type)) { sql += ' AND n.note_type = ?'; params.push(type); }
  if (day >= 1 && day <= 50) { sql += ' AND n.day_number = ?'; params.push(day); }
  if (q) { sql += ' AND n.body LIKE ?'; params.push(`%${q}%`); }

  sql += ' ORDER BY n.updated_at DESC LIMIT 200';

  const { results } = await env.DB.prepare(sql).bind(...params).all();
  const notes = (results || []).map(r => ({
    id: r.id,
    note_type: r.note_type,
    body: r.body,
    book: r.book,
    chapter: r.chapter,
    verse: r.verse,
    day_number: r.day_number,
    created_at: r.created_at,
    updated_at: r.updated_at,
    sent_to_leaders: r.note_type === 'observation' || r.note_type === 'question',
    inbox_status: r.inbox_status || (r.note_type === 'observation' || r.note_type === 'question' ? 'new' : null),
    show_name: r.show_name === 1,
    reply: r.reply_text ? { text: r.reply_text, created_at: r.reply_created_at } : null
  }));

  return json({ notes });
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;

  const body = await readJson(request);
  const noteType = String(body?.note_type || '');
  const text = String(body?.body || '').trim();
  const book = String(body?.book || '').trim();
  const chapter = parseInt(body?.chapter ?? 0, 10);
  const verse = body?.verse != null ? parseInt(body.verse, 10) : null;
  const dayNumber = body?.day_number != null ? parseInt(body.day_number, 10) : null;
  const showName = (body?.show_name === true || body?.show_name === 1 || body?.show_name === '1') ? 1 : 0;

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

  // If Observation or Question, automatically and transactionally copy to leader_inbox
  if (noteType === 'observation' || noteType === 'question') {
    const ref = `${book} ${chapter}${verse ? ':' + verse : ''}`.trim();
    await env.DB.prepare(
      `INSERT INTO leader_inbox (id, note_id, author_user_id, type, reference, text, show_name, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)`
    ).bind(uuid(), id, user.id, noteType, ref, text, showName, now, now).run();
  }

  // Points: +2 per observation/question note, exactly once per note id.
  let awarded = 0;
  if (noteType === 'observation') {
    awarded = (await awardPoints(env.DB, user.id, 'observation_saved', `observation_saved:${user.id}:${id}`, { dayNumber })).points;
  } else if (noteType === 'question') {
    awarded = (await awardPoints(env.DB, user.id, 'question_saved', `question_saved:${user.id}:${id}`, { dayNumber })).points;
  }

  return json({ ok: true, id, points_awarded: awarded }, 201);
}
