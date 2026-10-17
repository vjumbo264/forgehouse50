// GET /api/community/latest — returns the latest published item with its reply for the homepage card.
import { json } from '../../lib/http.mjs';

export async function onRequestGet({ request, env }) {
  const sql = `
    SELECT li.id, li.type, li.reference, li.text, li.show_name, li.created_at,
           cr.text AS reply_text, cr.created_at AS reply_created_at,
           pr.name AS author_first_name, pr.surname AS author_surname, pr.avatar_id
    FROM leader_inbox li
    JOIN community_replies cr ON cr.inbox_id = li.id
    LEFT JOIN profiles pr ON pr.id = li.author_user_id
    WHERE li.status = 'published'
      AND li.type IN ('observation', 'question')
    ORDER BY li.created_at DESC
    LIMIT 1
  `;

  const row = await env.DB.prepare(sql).first();
  if (!row) {
    return json({ ok: true, post: null });
  }

  const isAnonymous = row.show_name !== 1;
  const authorName = isAnonymous
    ? 'Anonymous'
    : [row.author_first_name, row.author_surname].filter(Boolean).join(' ').trim() || row.author_first_name || 'Member';

  return json({
    ok: true,
    post: {
      id: row.id,
      type: row.type,
      reference: row.reference,
      text: row.text,
      author_name: authorName,
      avatar_id: isAnonymous ? null : row.avatar_id,
      is_anonymous: isAnonymous,
      created_at: row.created_at,
      reply: {
        text: row.reply_text,
        created_at: row.reply_created_at
      }
    }
  });
}
