// PUT    /api/notes/:id — edit OWN note.
// DELETE /api/notes/:id — delete OWN note.
// Both are strictly user-scoped at the query layer.
import { json, badRequest, notFound, readJson, nowIso } from '../../lib/http.mjs';
import { requireUser } from '../../lib/auth.mjs';

const TYPES = ['observation', 'question', 'scripture_connection', 'application', 'prayer'];

function noteId(request) {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 1];
}

export async function onRequestPut({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;
  const id = noteId(request);
  const body = await readJson(request);
  const text = String(body?.body || '').trim();
  const noteType = String(body?.note_type || '');
  if (!text || text.length > 5000) return badRequest('Note text is required (max 5000 chars)');
  if (!TYPES.includes(noteType)) return badRequest(`note_type must be one of: ${TYPES.join(', ')}`);

  const r = await env.DB.prepare(
    'UPDATE notes SET body = ?, note_type = ?, updated_at = ? WHERE id = ? AND user_id = ?'
  ).bind(text, noteType, nowIso(), id, user.id).run();
  if ((r.meta?.changes ?? 0) === 0) return notFound('Note not found');
  return json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;
  const r = await env.DB.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?').bind(noteId(request), user.id).run();
  if ((r.meta?.changes ?? 0) === 0) return notFound('Note not found');
  return json({ ok: true });
}
