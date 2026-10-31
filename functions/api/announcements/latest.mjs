// GET /api/announcements/latest — returns newest active announcement + archive counts (never cached).
import { json } from '../../lib/http.mjs';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
  'Pragma': 'no-cache',
  'Expires': '0',
  'CDN-Cache-Control': 'no-store',
  'Cloudflare-CDN-Cache-Control': 'no-store',
};

export async function onRequestGet({ env }) {
  const [row, counts] = await Promise.all([
    env.DB.prepare(
      "SELECT id, title, body, status, created_at, updated_at FROM announcements WHERE status = 'active' ORDER BY created_at DESC LIMIT 1"
    ).first(),
    env.DB.prepare(
      `SELECT
         SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_count,
         SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END) AS archived_count,
         COUNT(*) AS total_count
       FROM announcements
       WHERE status IN ('active', 'archived')`
    ).first(),
  ]);

  const totalActive = Number(counts?.active_count ?? 0);
  const totalArchived = Number(counts?.archived_count ?? 0);
  const totalAll = Number(counts?.total_count ?? 0);

  return json(
    {
      ok: true,
      total_active: totalActive,
      total_archived: totalArchived,
      total_all: totalAll,
      announcement: row
        ? {
            id: row.id,
            title: row.title,
            body: row.body,
            status: row.status || 'active',
            created_at: row.created_at,
            updated_at: row.updated_at || row.created_at,
          }
        : null,
    },
    200,
    NO_STORE_HEADERS
  );
}
