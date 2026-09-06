// GET  /api/notes — list OWN notes (search + type/day filters), user-scoped.
// POST /api/notes — create a note, award observation/question points idempotently.
import { json, badRequest, readJson, uuid } from '../../lib/http.mjs';
import { requireUser } from '../../lib/auth.mjs';
import { awardPoints } from '../../lib/points.mjs';

const TYPES = ['observation', 'question', 'scripture_connection', 'application', 'prayer'];

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;

  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim();
  const type = url.searchParams.get('type') || '';
  const day = parseInt(url.searchParams.get('day') || '0', 10);

  let sql = 'SELECT id, note_type, body, book, chapter, verse, day_number, created_at, updated_at FROM notes WHERE user_id = ?';
  const params = [user.id];
  if (type && TYPES.includes(type)) { sql += ' AND note_type = ?'; params.push(type); }
  if (day >= 1 && day <= 50) { sql += ' AND day_number = ?'; params.push(day); }
  if (q) { sql += ' AND body LIKE ?'; params.push(`%${q}%`); }
  sql += ' ORDER BY updated_at DESC LIMIT 200';

  const { results } = await env.DB.prepare(sql).bind(...params).all();
  return json({ notes: results || [] });
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

  if (!TYPES.includes(noteType)) return badRequest(`note_type must be one of: ${TYPES.join(', ')}`);
  if (!text || text.length > 5000) return badRequest('Note text is required (max 5000 chars)');
  if (!book || !chapter) return badRequest('book and chapter are required');
  if (dayNumber != null && (dayNumber < 1 || dayNumber > 50)) return badRequest('day_number must be 1–50');

  const id = uuid();
  await env.DB.prepare(
    `INSERT INTO notes (id, user_id, note_type, body, book, chapter, verse, day_number)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, user.id, noteType, text, book, chapter, verse, dayNumber).run();

  // Points: +2 per observation/question note, exactly once per note id.
  let awarded = 0;
  if (noteType === 'observation') {
    awarded = (await awardPoints(env.DB, user.id, 'observation_saved', `observation_saved:${user.id}:${id}`, { dayNumber })).points;
  } else if (noteType === 'question') {
    awarded = (await awardPoints(env.DB, user.id, 'question_saved', `question_saved:${user.id}:${id}`, { dayNumber })).points;
  }

  return json({ ok: true, id, points_awarded: awarded }, 201);
}
