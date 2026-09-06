// GET /api/admin/participants — list participants with aggregate progress.
// Admin only. No private note content — aggregate counts only.
import { json, forbidden } from '../../lib/http.mjs';
import { requireUser, requireAdmin } from '../../lib/auth.mjs';

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;
  if (!requireAdmin(user)) return forbidden('Admin access required');

  const { results } = await env.DB.prepare(
    `SELECT pr.id, pr.name, pr.email, pr.role, pr.created_at,
            COALESCE((SELECT COUNT(*) FROM reading_progress rp WHERE rp.user_id = pr.id AND rp.completed = 1),0) AS days_completed,
            COALESCE((SELECT SUM(rp.chapters_read) FROM reading_progress rp WHERE rp.user_id = pr.id AND rp.completed = 1),0) AS chapters,
            COALESCE((SELECT SUM(rp.reading_seconds) FROM reading_progress rp WHERE rp.user_id = pr.id),0) AS reading_seconds,
            COALESCE((SELECT SUM(p.points) FROM points p WHERE p.user_id = pr.id),0) AS points,
            COALESCE((SELECT COUNT(*) FROM notes n WHERE n.user_id = pr.id),0) AS notes_count
     FROM profiles pr WHERE pr.email_verified = 1
     ORDER BY points DESC LIMIT 500`
  ).all();

  return json({ participants: results || [] });
}
