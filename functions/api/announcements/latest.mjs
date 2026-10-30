// GET /api/announcements/latest — returns latest active announcement with count of older ones.
import { json } from '../../lib/http.mjs';

export async function onRequestGet({ request, env }) {
  const row = await env.DB.prepare(
    "SELECT id, title, body, created_at FROM announcements WHERE status = 'active' ORDER BY created_at DESC LIMIT 1"
  ).first();

  const countRow = await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM announcements WHERE status = 'active'"
  ).first();

  return json(
    {
      ok: true,
      total_active: countRow?.total ?? 0,
      announcement: row
        ? {
            id: row.id,
            title: row.title,
            body: row.body,
            created_at: row.created_at,
          }
        : null,
    },
    200,
    {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    }
  );
}
