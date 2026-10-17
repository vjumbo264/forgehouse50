// PUT    /api/notes/:id — edit OWN note
// PATCH  /api/notes/:id — patch OWN note
// POST   /api/notes/:id — update alias for OWN note
// DELETE /api/notes/:id — delete OWN note
// Note edits update leader_inbox and track history in leader_inbox_versions.
// Note deletions remove the note from the user's list but PRESERVE the leader copy.

import { json, badRequest, notFound, forbidden, readJson, nowIso, uuid } from '../../lib/http.mjs';
import { requireUser } from '../../lib/auth.mjs';

const TYPES = ['observation', 'question', 'scripture_connection', 'insight', 'application', 'prayer'];
const LEADER_TYPES = ['observation', 'question', 'prayer', 'application'];

function noteId(request) {
  const url = new URL(request.url);
  const parts = url.pathname.replace(/\/+$/, '').split('/');
  return parts[parts.length - 1];
}

async function handleUpdate({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;

  const url = new URL(request.url);
  let id = noteId(request);
  const body = await readJson(request);

  if ((!id || id === 'notes' || id === '') && body?.id) {
    id = String(body.id).trim();
  }
  if (!id || id === 'notes') {
    return badRequest('Note ID is required');
  }

  // Fetch current note to verify ownership
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

  // Handle leader_inbox
  const inboxItem = await env.DB.prepare(
    'SELECT id, text, show_name, allow_group_share FROM leader_inbox WHERE note_id = ?'
  ).bind(id).first();

  if (LEADER_TYPES.includes(noteType)) {
    if (inboxItem) {
      // If text changed, record snapshot in version history
      if (inboxItem.text !== text) {
        await env.DB.prepare(
          'INSERT INTO leader_inbox_versions (id, inbox_id, text, edited_at) VALUES (?, ?, ?, ?)'
        ).bind(uuid(), inboxItem.id, inboxItem.text, now).run();
      }
      const finalShowName = showName != null ? showName : inboxItem.show_name;
      const finalAllowGroupShare = allowGroupShare != null ? allowGroupShare : (inboxItem.allow_group_share || 0);

      await env.DB.prepare(
        `UPDATE leader_inbox 
         SET text = ?, type = ?, show_name = ?, allow_group_share = ?, sent_at = ?, updated_at = ? 
         WHERE id = ?`
      ).bind(text, noteType, finalShowName, finalAllowGroupShare, now, now, inboxItem.id).run();
    } else {
      // Note was edited into a leader-visible type; create inbox entry
      const ref = `${existingNote.book} ${existingNote.chapter}${existingNote.verse ? ':' + existingNote.verse : ''}`.trim();
      await env.DB.prepare(
        `INSERT INTO leader_inbox (id, note_id, author_user_id, type, reference, text, show_name, allow_group_share, status, first_sent_at, sent_at, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?)`
      ).bind(uuid(), id, user.id, noteType, ref, text, showName != null ? showName : 0, allowGroupShare != null ? allowGroupShare : 0, existingNote.created_at || now, now, now, now).run();
    }
  } else if (noteType === 'insight') {
    // Insight must NEVER be in leader_inbox
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
  return handleUpdate(context);
}

export async function onRequestPatch(context) {
  return handleUpdate(context);
}

export async function onRequestPost(context) {
  return handleUpdate(context);
}

export async function onRequestDelete({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;

  const id = noteId(request);
  if (!id || id === 'notes') return badRequest('Note ID is required');

  const r = await env.DB.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?').bind(id, user.id).run();
  if ((r.meta?.changes ?? 0) === 0) return notFound('Note not found');

  return json({ ok: true, deleted_id: id });
}
