// GET /api/community/posts?cursor= — returns published items only, newest first.
// Author's name is returned ONLY when show_name is true; user_id is NEVER returned for anonymous items.
// Insights, Prayers, and Applications are NEVER exposed.
import { json } from '../../lib/http.mjs';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const cursor = (url.searchParams.get('cursor') || '').trim();
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));

  let sql = `
    SELECT li.id, li.type, li.reference, li.text, li.show_name, li.created_at, li.updated_at,
           cr.text AS reply_text, cr.created_at AS reply_created_at,
           pr.name AS author_first_name, pr.surname AS author_surname, pr.avatar_id
    FROM leader_inbox li
    JOIN community_replies cr ON cr.inbox_id = li.id
    LEFT JOIN profiles pr ON pr.id = li.author_user_id
    WHERE li.status = 'published'
      AND li.type IN ('observation', 'question')
  `;
  const params = [];

  if (cursor) {
    sql += ' AND li.created_at < ?';
    params.push(cursor);
  }

  sql += ' ORDER BY li.created_at DESC LIMIT ?';
  params.push(limit + 1);

  const { results } = await env.DB.prepare(sql).bind(...params).all();
  const items = results || [];
  const hasMore = items.length > limit;
  const pageItems = hasMore ? items.slice(0, limit) : items;

  const posts = pageItems.map(row => {
    const isAnonymous = row.show_name !== 1;
    const authorName = isAnonymous
      ? 'Anonymous'
      : [row.author_first_name, row.author_surname].filter(Boolean).join(' ').trim() || row.author_first_name || 'Member';

    return {
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
    };
  });

  const nextCursor = hasMore && pageItems.length > 0 ? pageItems[pageItems.length - 1].created_at : null;

  return json({
    ok: true,
    posts,
    next_cursor: nextCursor,
    has_more: hasMore
  });
}
