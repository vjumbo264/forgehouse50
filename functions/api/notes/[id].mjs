// PUT    /api/notes/:id — edit OWN note.
// DELETE /api/notes/:id — delete OWN note.
// Note edits update leader_inbox and track history in leader_inbox_versions.
// Note deletions remove the note from the user's list but PRESERVE the leader copy.
import { json, badRequest, notFound, readJson, nowIso, uuid } from '../../lib/http.mjs';
import { requireUser } from '../../lib/auth.mjs';

const TYPES = ['observation', 'question', 'scripture_connection', 'insight', 'application', 'prayer'];

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
  const showName = body?.show_name != null ? (body.show_name === true || body.show_name === 1 || body.show_name === '1' ? 1 : 0) : null;

  if (!text || text.length > 5000) return badRequest('Note text is required (max 5000 chars)');
  if (!TYPES.includes(noteType)) return badRequest(`note_type must be one of: ${TYPES.join(', ')}`);

  const now = nowIso();
  const r = await env.DB.prepare(
    'UPDATE notes SET body = ?, note_type = ?, updated_at = ? WHERE id = ? AND user_id = ?'
  ).bind(text, noteType, now, id, user.id).run();

  if ((r.meta?.changes ?? 0) === 0) return notFound('Note not found');

  // Handle leader_inbox update
  const inboxItem = await env.DB.prepare(
    'SELECT id, text, show_name FROM leader_inbox WHERE note_id = ?'
  ).bind(id).first();

  if (inboxItem) {
    // If text changed, record version history
    if (inboxItem.text !== text) {
      await env.DB.prepare(
        'INSERT INTO leader_inbox_versions (id, inbox_id, text, edited_at) VALUES (?, ?, ?, ?)'
      ).bind(uuid(), inboxItem.id, inboxItem.text, now).run();
    }
    const finalShowName = showName != null ? showName : inboxItem.show_name;
    await env.DB.prepare(
      'UPDATE leader_inbox SET text = ?, type = ?, show_name = ?, updated_at = ? WHERE id = ?'
    ).bind(text, noteType, finalShowName, now, inboxItem.id).run();
  } else if (noteType === 'observation' || noteType === 'question') {
    // Note was edited into an observation or question, add to inbox
    const noteRow = await env.DB.prepare('SELECT book, chapter, verse FROM notes WHERE id = ?').bind(id).first();
    const ref = noteRow ? `${noteRow.book} ${noteRow.chapter}${noteRow.verse ? ':' + noteRow.verse : ''}`.trim() : '';
    await env.DB.prepare(
      `INSERT INTO leader_inbox (id, note_id, author_user_id, type, reference, text, show_name, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)`
    ).bind(uuid(), id, user.id, noteType, ref, text, showName != null ? showName : 0, now, now).run();
  }

  return json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;

  const id = noteId(request);
  // Deleting removes note from the user's personal list.
  // The submitted leader_inbox row remains intact (per operator policy).
  const r = await env.DB.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?').bind(id, user.id).run();
  if ((r.meta?.changes ?? 0) === 0) return notFound('Note not found');

  return json({ ok: true });
}
