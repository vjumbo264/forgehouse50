// GET /api/announcements — returns active announcements with pagination.
import { json } from '../../lib/http.mjs';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const cursor = (url.searchParams.get('cursor') || '').trim();
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));

  let sql = "SELECT id, title, body, created_at FROM announcements WHERE status = 'active'";
  const params = [];

  if (cursor) {
    sql += " AND created_at < ?";
    params.push(cursor);
  }

  sql += " ORDER BY created_at DESC LIMIT ?";
  params.push(limit + 1);

  const { results } = await env.DB.prepare(sql).bind(...params).all();
  const items = results || [];
  const hasMore = items.length > limit;
  const pageItems = hasMore ? items.slice(0, limit) : items;

  const nextCursor = hasMore && pageItems.length > 0 ? pageItems[pageItems.length - 1].created_at : null;

  return json({
    ok: true,
    announcements: pageItems,
    next_cursor: nextCursor,
    has_more: hasMore
  });
}
