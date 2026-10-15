// GET /api/admin/participants — list participants with aggregate progress.
// Admin only. No private note content — aggregate counts only.
import { json, forbidden } from '../../lib/http.mjs';
import { requireUser, requireAdmin } from '../../lib/auth.mjs';

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;
  if (!requireAdmin(user)) return forbidden('Admin access required');

  const { results } = await env.DB.prepare(
    `SELECT pr.id, pr.name, pr.surname AS surname, pr.email, pr.role, pr.avatar_id, pr.created_at,
            COALESCE((SELECT COUNT(*) FROM reading_progress rp WHERE rp.user_id = pr.id AND rp.completed = 1),0) AS days_completed,
            COALESCE((SELECT SUM(rp.chapters_read) FROM reading_progress rp WHERE rp.user_id = pr.id AND rp.completed = 1),0) AS chapters,
            COALESCE((SELECT SUM(rp.reading_seconds) FROM reading_progress rp WHERE rp.user_id = pr.id),0) AS reading_seconds,
            COALESCE((SELECT SUM(p.points) FROM points p WHERE p.user_id = pr.id),0) AS points,
            COALESCE((SELECT COUNT(*) FROM notes n WHERE n.user_id = pr.id),0) AS notes_count
     FROM profiles pr WHERE pr.email_verified = 1
     ORDER BY points DESC LIMIT 500`
  ).all();

  const participants = (results || []).map(p => {
    const fullName = [p.name, p.surname].filter(Boolean).join(' ').trim() || p.name || 'Member';
    const shortTag = (p.id || '').slice(-4);
    const sec = p.reading_seconds || 0;
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const readingTimeFormatted = `${hrs} h ${mins} m read`;
    return {
      ...p,
      full_name: fullName,
      short_tag: shortTag,
      total_reading_seconds: sec,
      reading_time_formatted: readingTimeFormatted,
      status: p.role || 'member',
    };
  });

  return json({ participants });
}
