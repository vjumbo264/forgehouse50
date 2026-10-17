// GET /api/notes/:id/status (and /api/me/notes/:id/status)
// Allows note author to check sent-to-leaders status, answered state, and replies.
import { json, notFound } from '../../../lib/http.mjs';
import { requireUser } from '../../../lib/auth.mjs';

function noteId(request) {
  const parts = new URL(request.url).pathname.split('/');
  // URL ends in /status, so note ID is previous segment
  return parts[parts.length - 2];
}

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;

  const id = noteId(request);

  const query = `
    SELECT n.id, n.note_type, n.created_at,
           li.id AS inbox_id, li.status AS inbox_status, li.show_name,
           cr.text AS reply_text, cr.created_at AS reply_created_at
    FROM notes n
    LEFT JOIN leader_inbox li ON li.note_id = n.id
    LEFT JOIN community_replies cr ON cr.inbox_id = li.id
    WHERE n.id = ? AND n.user_id = ?
  `;

  const item = await env.DB.prepare(query).bind(id, user.id).first();
  if (!item) return notFound('Note not found');

  const isLeaderVisible = item.note_type === 'observation' || item.note_type === 'question';

  return json({
    ok: true,
    id: item.id,
    type: item.note_type,
    sent_to_leaders: isLeaderVisible,
    inbox_status: item.inbox_status || (isLeaderVisible ? 'new' : null),
    answered: !!item.reply_text,
    reply: item.reply_text ? {
      text: item.reply_text,
      created_at: item.reply_created_at
    } : null,
    show_name: item.show_name === 1
  });
}
