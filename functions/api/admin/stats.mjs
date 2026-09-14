// GET /api/admin/stats — programme-wide aggregates. Admin only.
// Private notes are NEVER exposed here — counts only, and only where needed.
// quiz_redesign_and_launch_wipe_v1: quiz stats are informational only (avg
// score % over the single attempt allowed per user/day) — no pass/fail counts.
// per_user_calendar_and_quiz_v1: "behind schedule" is now PER-USER — each
// verified user is behind if they haven't completed the latest reading day
// that their OWN calendar says is due today.
import { json, forbidden } from '../../lib/http.mjs';
import { requireUser, requireAdmin } from '../../lib/auth.mjs';
import { elapsedDays, utcToday } from '../../lib/calendar.mjs';

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;
  if (!requireAdmin(user)) return forbidden('Admin access required');

  const today = utcToday();

  const [total, active, chapters, perDay, quizStats] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS c FROM profiles WHERE email_verified = 1').first(),
    env.DB.prepare('SELECT COUNT(DISTINCT user_id) AS c FROM reading_progress WHERE completed = 1').first(),
    env.DB.prepare('SELECT COALESCE(SUM(chapters_read),0) AS c FROM reading_progress WHERE completed = 1').first(),
    env.DB.prepare('SELECT day_number, COUNT(*) AS completions FROM reading_progress WHERE completed = 1 GROUP BY day_number ORDER BY day_number').all(),
    env.DB.prepare(`SELECT COUNT(*) AS attempts, COUNT(DISTINCT user_id) AS quizzed_users,
                           COALESCE(AVG(CASE WHEN total > 0 THEN 100.0 * score / total END), 0) AS avg_pct
                    FROM quiz_attempts`).first(),
  ]);

  // Per-user "behind schedule": for each verified user compute the latest day
  // their own calendar makes due today, then check whether it's completed.
  const { results: calRows } = await env.DB.prepare(
    `SELECT urd.user_id, urd.day_number, urd.date
     FROM user_reading_days urd
     JOIN profiles pr ON pr.id = urd.user_id
     WHERE pr.email_verified = 1 AND urd.date <= ?`
  ).bind(today).all();

  const dueByUser = new Map();   // user_id -> latest due day_number
  for (const r of calRows || []) {
    const cur = dueByUser.get(r.user_id) || 0;
    if (r.day_number > cur) dueByUser.set(r.user_id, r.day_number);
  }

  let behindCount = 0;
  if (dueByUser.size) {
    const { results: doneRows } = await env.DB.prepare(
      'SELECT user_id, day_number FROM reading_progress WHERE completed = 1'
    ).all();
    const done = new Set((doneRows || []).map(r => `${r.user_id}:${r.day_number}`));
    for (const [uid, dueDay] of dueByUser) if (!done.has(`${uid}:${dueDay}`)) behindCount++;
  }

  // completed_today: completions recorded on today's calendar date (per-user
  // day numbers differ, so count by completed_at date instead of day_number).
  const completedToday = await env.DB.prepare(
    "SELECT COUNT(*) AS c FROM reading_progress WHERE completed = 1 AND substr(completed_at,1,10) = ?"
  ).bind(today).first();

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
    users_behind_schedule: behindCount,       // per-user due-day calculation
    quiz_attempts_total: quizStats?.attempts ?? 0,          // one attempt per user/day max (idx_quiz_one_attempt)
    quiz_avg_score_pct: Math.round((quizStats?.avg_pct ?? 0) * 10) / 10,
    users_quizzed: quizStats?.quizzed_users ?? 0,
    today_date: today,
    per_day_completions: perDay.results || [],
  });
}
