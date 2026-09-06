// POST /api/read/complete — mark a reading day complete (idempotent) and award points.
import { json, badRequest, readJson, uuid, nowIso } from '../../lib/http.mjs';
import { requireUser } from '../../lib/auth.mjs';
import { awardPoints } from '../../lib/points.mjs';

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;

  const body = await readJson(request);
  const n = parseInt(body?.day_number ?? 0, 10);
  if (!n || n < 1 || n > 50) return badRequest('A reading day between 1 and 50 is required');

  // Chapter count for this day (from assignments).
  const row = await env.DB.prepare(
    'SELECT COALESCE(SUM(chapter_count),0) AS chapters FROM reading_assignments WHERE day_number = ?'
  ).bind(n).first();
  const chapters = row?.chapters ?? 0;

  // Upsert progress row (idempotent completion).
  await env.DB.prepare(
    `INSERT INTO reading_progress (id, user_id, day_number, completed, completed_at, chapters_read)
     VALUES (?, ?, ?, 1, ?, ?)
     ON CONFLICT(user_id, day_number) DO UPDATE SET
       completed = 1,
       completed_at = COALESCE(reading_progress.completed_at, excluded.completed_at),
       chapters_read = MAX(reading_progress.chapters_read, excluded.chapters_read),
       updated_at = ?`
  ).bind(uuid(), user.id, n, nowIso(), chapters, nowIso()).run();

  // Points — idempotency keys make these exactly-once.
  const reading = await awardPoints(env.DB, user.id, 'reading_completed', `reading_completed:${user.id}:${n}`, { dayNumber: n });

  // Streak point: awarded once per completed day when it extends a run.
  const streak = await awardPoints(env.DB, user.id, 'daily_streak', `daily_streak:${user.id}:${n}`, { dayNumber: n });

  // Programme completion bonus once all 50 days are done.
  const done = await env.DB.prepare(
    'SELECT COUNT(*) AS c FROM reading_progress WHERE user_id = ? AND completed = 1'
  ).bind(user.id).first();
  let programme = { awarded: false, points: 0 };
  if ((done?.c ?? 0) >= 50) {
    programme = await awardPoints(env.DB, user.id, 'programme_completed', `programme_completed:${user.id}`);
  }

  return json({ ok: true, day_number: n, points_awarded: reading.points + streak.points + programme.points });
}
