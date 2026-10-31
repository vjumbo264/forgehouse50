// GET /api/announcements — returns active and retired (archived) announcements for the archive screen.
import { json } from '../../lib/http.mjs';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
  'Pragma': 'no-cache',
  'Expires': '0',
  'CDN-Cache-Control': 'no-store',
  'Cloudflare-CDN-Cache-Control': 'no-store',
};

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const cursor = (url.searchParams.get('cursor') || '').trim();
  const statusFilter = (url.searchParams.get('status') || 'all').trim();
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10) || 20));

  let sql = "SELECT id, title, body, status, created_at, updated_at FROM announcements WHERE ";
  const params = [];
  if (statusFilter === 'active' || statusFilter === 'archived') {
    sql += "status = ?";
    params.push(statusFilter);
  } else {
    sql += "status IN ('active', 'archived')";
  }

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

  return json(
    {
      ok: true,
      announcements: pageItems,
      next_cursor: nextCursor,
      has_more: hasMore,
    },
    200,
    NO_STORE_HEADERS
  );
}
