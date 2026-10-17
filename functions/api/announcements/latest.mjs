// GET /api/announcements/latest — returns latest active announcement for homepage card.
import { json } from '../../lib/http.mjs';

export async function onRequestGet({ request, env }) {
  const row = await env.DB.prepare(
    "SELECT id, title, body, created_at FROM announcements WHERE status = 'active' ORDER BY created_at DESC LIMIT 1"
  ).bind().first();

  return json({
    ok: true,
    announcement: row ? {
      id: row.id,
      title: row.title,
      body: row.body,
      created_at: row.created_at
    } : null
  });
}
