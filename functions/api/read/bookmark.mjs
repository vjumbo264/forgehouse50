// GET    /api/read/bookmarks — list OWN bookmarks.
// POST   /api/read/bookmark  — upsert a bookmark.
// DELETE /api/read/bookmark  — remove a bookmark.
import { json, badRequest, readJson, uuid } from '../../lib/http.mjs';
import { requireUser } from '../../lib/auth.mjs';

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;
  const { results } = await env.DB.prepare(
    'SELECT id, book, chapter, verse, day_number, created_at FROM bookmarks WHERE user_id = ? ORDER BY created_at DESC LIMIT 200'
  ).bind(user.id).all();
  return json({ bookmarks: results || [] });
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;
  const body = await readJson(request);
  const book = String(body?.book || '').trim();
  const chapter = parseInt(body?.chapter ?? 0, 10);
  const verse = body?.verse != null ? parseInt(body.verse, 10) : null;
  const dayNumber = body?.day_number != null ? parseInt(body.day_number, 10) : null;
  if (!book || !chapter) return badRequest('book and chapter are required');

  await env.DB.prepare(
    `INSERT INTO bookmarks (id, user_id, book, chapter, verse, day_number)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, book, chapter, verse) DO NOTHING`
  ).bind(uuid(), user.id, book, chapter, verse, dayNumber).run();
  return json({ ok: true }, 201);
}

export async function onRequestDelete({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;
  const body = await readJson(request);
  await env.DB.prepare(
    'DELETE FROM bookmarks WHERE user_id = ? AND book = ? AND chapter = ? AND IFNULL(verse, -1) = IFNULL(?, -1)'
  ).bind(user.id, String(body?.book || ''), parseInt(body?.chapter ?? 0, 10), body?.verse != null ? parseInt(body.verse, 10) : null).run();
  return json({ ok: true });
}
