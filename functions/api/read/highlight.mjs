// GET    /api/read/highlights?book=&chapter= — OWN highlights for a passage.
// POST   /api/read/highlight  — upsert a highlight.
// DELETE /api/read/highlight  — remove a highlight.
import { json, badRequest, readJson, uuid } from '../../lib/http.mjs';
import { requireUser } from '../../lib/auth.mjs';

const COLORS = ['amber', 'green', 'blue', 'rose'];

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;
  const url = new URL(request.url);
  const book = url.searchParams.get('book') || '';
  const chapter = parseInt(url.searchParams.get('chapter') || '0', 10);
  let sql = 'SELECT id, book, chapter, verse_start, verse_end, color, created_at FROM highlights WHERE user_id = ?';
  const params = [user.id];
  if (book && chapter) { sql += ' AND book = ? AND chapter = ?'; params.push(book, chapter); }
  sql += ' ORDER BY created_at DESC LIMIT 500';
  const { results } = await env.DB.prepare(sql).bind(...params).all();
  return json({ highlights: results || [] });
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;
  const body = await readJson(request);
  const book = String(body?.book || '').trim();
  const chapter = parseInt(body?.chapter ?? 0, 10);
  const vs = parseInt(body?.verse_start ?? 0, 10);
  const ve = parseInt(body?.verse_end ?? 0, 10);
  const color = COLORS.includes(body?.color) ? body.color : 'amber';
  if (!book || !chapter || !vs || !ve || ve < vs) return badRequest('book, chapter, verse_start, verse_end are required');

  await env.DB.prepare(
    `INSERT INTO highlights (id, user_id, book, chapter, verse_start, verse_end, color)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, book, chapter, verse_start, verse_end) DO UPDATE SET color = excluded.color`
  ).bind(uuid(), user.id, book, chapter, vs, ve, color).run();
  return json({ ok: true }, 201);
}

export async function onRequestDelete({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;
  const body = await readJson(request);
  await env.DB.prepare(
    'DELETE FROM highlights WHERE id = ? AND user_id = ?'
  ).bind(String(body?.id || ''), user.id).run();
  return json({ ok: true });
}
