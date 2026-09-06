// GET /api/admin/stats — programme-wide aggregates. Admin only.
// Private notes are NEVER exposed here — counts only, and only where needed.
import { json, forbidden } from '../../lib/http.mjs';
import { requireUser, requireAdmin } from '../../lib/auth.mjs';

function todayUtc() { return new Date().toISOString().slice(0, 10); }

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;
  if (!requireAdmin(user)) return forbidden('Admin access required');

  const today = todayUtc();
  const todayRow = await env.DB.prepare('SELECT day_number FROM reading_days WHERE date = ?').bind(today).first();
  const todayDay = todayRow?.day_number ?? null;

  const [total, active, completedToday, chapters, perDay] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS c FROM profiles WHERE email_verified = 1').first(),
    env.DB.prepare('SELECT COUNT(DISTINCT user_id) AS c FROM reading_progress WHERE completed = 1').first(),
    todayDay
      ? env.DB.prepare('SELECT COUNT(*) AS c FROM reading_progress WHERE day_number = ? AND completed = 1').bind(todayDay).first()
      : Promise.resolve({ c: 0 }),
    env.DB.prepare('SELECT COALESCE(SUM(chapters_read),0) AS c FROM reading_progress WHERE completed = 1').first(),
    env.DB.prepare(`SELECT day_number, COUNT(*) AS completions FROM reading_progress WHERE completed = 1 GROUP BY day_number ORDER BY day_number`).all(),
  ]);

  // Users behind schedule: verified users who haven't completed the most recent due reading day.
  const dueDays = await env.DB.prepare('SELECT MAX(day_number) AS d FROM reading_days WHERE date <= ?').bind(today).first();
  const dueDay = dueDays?.d ?? 0;
  let behind = { c: 0 };
  if (dueDay > 0) {
    behind = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM profiles pr
       WHERE pr.email_verified = 1 AND NOT EXISTS (
         SELECT 1 FROM reading_progress rp WHERE rp.user_id = pr.id AND rp.day_number = ? AND rp.completed = 1)`
    ).bind(dueDay).first();
  }

  const totalParticipants = total?.c ?? 0;
  const activeParticipants = active?.c ?? 0;
  const avgCompletion = totalParticipants > 0
    ? Math.round(((perDay.results || []).reduce((s, r) => s + r.completions, 0) / (totalParticipants * 50)) * 1000) / 10
    : 0;

  return json({
    total_participants: totalParticipants,
    active_participants: activeParticipants,
    completed_today: completedToday?.c ?? 0,
    average_completion_percent: avgCompletion,
    total_chapters_completed: chapters?.c ?? 0,
    users_behind_schedule: behind?.c ?? 0,
    today_reading_day: todayDay,
    per_day_completions: perDay.results || [],
  });
}
